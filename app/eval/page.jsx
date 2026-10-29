'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { byCode } from '@/lib/languages'

const CRITERIA = ['accuracy', 'fluency', 'terminology', 'faithfulness']
const fmt = (n, d = 1) => (n == null ? '—' : n.toFixed(d))

// Three outcomes per (case, model). A candidate_fail is the MODEL's fault (it
// produced no usable translation) and must hurt it. A judge_skip is a HARNESS
// fault (translation fine, but the judge's output was unparseable — see
// extractJson) and must NOT be blamed on the candidate. Folding both into one
// "error" bucket is what lets judge flakiness masquerade as model failure.
function classify(r) {
  if (r.error) return 'candidate_fail' // no valid translation
  if (r.judge?.overall == null) return 'judge_skip' // produced, unjudged
  return 'scored'
}

// Quality is averaged over scored cases only; coverage = produced / totalCases
// (judge_skips still count as produced, because the model did its job). The
// primary sort key folds the two together: composite = meanJudge × coverage,
// so a model that bails on the hard cases can't win on a thin denominator.
function aggregate(resultsByItem) {
  const items = Object.values(resultsByItem)
  const totalCases = items.length
  const byModel = new Map()

  for (const data of items) {
    for (const r of data.results || []) {
      const m =
        byModel.get(r.baseId) ?? {
          baseId: r.baseId,
          label: r.label ?? r.baseId,
          produced: 0,
          scored: 0,
          candidateFails: 0,
          judgeSkips: 0,
          judgeSum: 0,
          chrfSum: 0,
          chrfN: 0,
          msSum: 0,
        }
      switch (classify(r)) {
        case 'candidate_fail':
          m.candidateFails++
          break
        case 'judge_skip':
          m.produced++
          m.judgeSkips++
          m.msSum += r.ms ?? 0
          break
        case 'scored':
          m.produced++
          m.scored++
          m.judgeSum += r.judge.overall
          m.msSum += r.ms ?? 0
          if (typeof r.chrf === 'number') {
            m.chrfSum += r.chrf
            m.chrfN++
          }
          break
      }
      byModel.set(r.baseId, m)
    }
  }

  return [...byModel.values()].map((m) => {
    const meanJudge = m.scored ? m.judgeSum / m.scored : 0
    const coverage = totalCases ? m.produced / totalCases : 0
    return {
      ...m,
      totalCases,
      meanJudge,
      coverage,
      composite: meanJudge * coverage,
      meanChrf: m.chrfN ? m.chrfSum / m.chrfN : null,
      meanMs: m.produced ? Math.round(m.msSum / m.produced) : null,
    }
  })
}

// Tiebreak is coverage → latency, deliberately NOT chrF: breaking a judge tie
// with chrF would promote the more reference-hugging (more literal) translation
// — i.e. use the metric we trust less to adjudicate the one we trust more — and
// chrF is unavailable for reference-free cases anyway. (Change from the original
// chrF-tiebreak behavior; see docs/eval-flow.md.)
function rankModels(rows, eps = 0.5) {
  return [...rows].sort((a, b) => {
    if (Math.abs(b.composite - a.composite) > eps) return b.composite - a.composite
    if (b.coverage !== a.coverage) return b.coverage - a.coverage
    return (a.meanMs ?? Infinity) - (b.meanMs ?? Infinity)
  })
}

export default function EvalPage() {
  const [items, setItems] = useState([])
  const [models, setModels] = useState([])
  const [judgeModel, setJudgeModel] = useState('')
  const [region, setRegion] = useState('')
  const [pickedItems, setPickedItems] = useState(() => new Set())
  const [pickedModels, setPickedModels] = useState(() => new Set())
  const [results, setResults] = useState({}) // itemId -> eval response
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/testset').then((r) => r.json()),
      fetch('/api/models').then((r) => r.json()),
    ])
      .then(([ts, md]) => {
        setItems(ts.items || [])
        setModels(md.models || [])
        setJudgeModel(md.judgeModel || '')
        setRegion(md.region || '')
        setPickedItems(new Set((ts.items || []).map((i) => i.id)))
        // default-select the Nova + Qwen candidates (most likely to have access)
        setPickedModels(
          new Set(
            (md.models || [])
              .filter((m) => m.family === 'Amazon Nova' || m.family === 'Qwen')
              .map((m) => m.baseId),
          ),
        )
      })
      .catch((e) => setError(e.message))
  }, [])

  const toggle = (set, key) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }

  const run = async () => {
    const chosenItems = items.filter((i) => pickedItems.has(i.id) && !i.error)
    const chosenModels = [...pickedModels]
    if (chosenItems.length === 0 || chosenModels.length === 0) {
      setError('Pick at lwest one test case and one model.')
      return
    }
    setError('')
    setRunning(true)
    setResults({})

    try {
      // sequential on purpose — parallelizing cases would multiply judge-gate
      // contention. Candidates within a case already fan out (Promise.all in
      // /api/eval); their judge calls re-serialize behind the OpenRouter gate,
      // so this outer loop is the only thing keeping total gate pressure bounded.
      for (let n = 0; n < chosenItems.length; n++) {
        const item = chosenItems[n]
        setProgress(`Evaluating ${n + 1}/${chosenItems.length}: ${item.title}`)
        const res = await fetch('/api/eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item, models: chosenModels }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Eval failed (${res.status})`)
        setResults((prev) => ({ ...prev, [item.id]: data }))
      }
      setProgress('Done.')
    } catch (e) {
      setError(e.message)
      setProgress('')
    } finally {
      setRunning(false)
    }
  }

  // Aggregate per model across all evaluated items → ranked leaderboard rows.
  const leaderboard = useMemo(() => rankModels(aggregate(results)), [results])

  const evaluatedItems = items.filter((i) => results[i.id])

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <span className="brand__mark">◈</span>
          <span className="brand__name">EVAL</span>
          <span className="brand__sub">model leaderboard</span>
          <Link className="navlink" href="/">
            ← translate
          </Link>
        </div>
        <div className="controls">
          <button className="run" onClick={run} disabled={running}>
            {running ? 'Running…' : 'Run eval'}
          </button>
        </div>
      </header>

      <main className="eval">
        <section className="eval__setup">
          <div className="card">
            <h3 className="card__title">
              Test cases <span className="muted">({items.length})</span>
            </h3>
            {items.length === 0 && (
              <p className="muted">
                No cases. Add JSON files to <code>eval/testset/</code>.
              </p>
            )}
            <ul className="picklist">
              {items.map((i) => (
                <li key={i.id}>
                  <label className={i.error ? 'pick pick--bad' : 'pick'}>
                    <input
                      type="checkbox"
                      checked={pickedItems.has(i.id)}
                      disabled={Boolean(i.error)}
                      onChange={() => setPickedItems((s) => toggle(s, i.id))}
                    />
                    <span className="pick__name">{i.title}</span>
                    <span className="pick__tag">
                      {i.error
                        ? i.error
                        : `${i.source}→${i.target}${i.reference ? ' · ref' : ' · no ref'}`}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3 className="card__title">
              Candidate models <span className="muted">({pickedModels.size} selected)</span>
            </h3>
            <ul className="picklist">
              {models.map((m) => (
                <li key={m.baseId}>
                  <label className="pick">
                    <input
                      type="checkbox"
                      checked={pickedModels.has(m.baseId)}
                      onChange={() => setPickedModels((s) => toggle(s, m.baseId))}
                    />
                    <span className="pick__name">
                      {m.label} <span className="muted">· {m.family}</span>
                    </span>
                    <span className="pick__tag" title={m.note}>
                      {m.tier}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="muted small">
              Judge: <code>{judgeModel || '…'}</code> · region <code>{region || '…'}</code>.
              Set <code>JUDGE_MODEL_ID</code> to a different family (e.g. Claude) for less
              biased ranking.
            </p>
          </div>
        </section>

        {(progress || error) && (
          <p className={error ? 'eval__status eval__status--err' : 'eval__status'}>
            {error || progress}
          </p>
        )}

        {leaderboard.length > 0 && (
          <section className="card">
            <h3 className="card__title">Leaderboard</h3>
            <table className="board">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Model</th>
                  <th>Score</th>
                  <th>Judge /100</th>
                  <th>chrF /100</th>
                  <th>Latency</th>
                  <th>Cand-fail</th>
                  <th>Judge-skip</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, n) => (
                  <tr key={r.baseId}>
                    <td className="muted">{n + 1}</td>
                    <td>{r.label}</td>
                    <td>
                      <Score v={r.composite} />
                    </td>
                    <td>
                      {r.scored ? fmt(r.meanJudge) : '—'}{' '}
                      <span className="muted small">· {r.produced}/{r.totalCases}</span>
                    </td>
                    <td>{fmt(r.meanChrf)}</td>
                    <td className="muted">
                      {r.meanMs == null ? '—' : `${(r.meanMs / 1000).toFixed(1)}s`}
                    </td>
                    <td className={r.candidateFails ? 'bad' : 'muted'}>
                      {r.candidateFails || '—'}
                    </td>
                    <td className={r.judgeSkips ? 'warn' : 'muted'} title="harness fault: judge output unparseable — not the model's fault">
                      {r.judgeSkips || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              <b>Score = Judge × coverage</b> (produced ÷ total cases), the sort key — a
              model that bails on hard cases can&apos;t win on a thin denominator. Judge is
              the mean over <i>scored</i> cases. Ties break on coverage then latency,{' '}
              <b>not</b> chrF. <b>Cand-fail</b> = no valid translation (counts against the
              model). <b>Judge-skip</b> = translation fine but judge output unparseable
              (harness fault; doesn&apos;t penalize). A rising judge-skip count is the cue to
              harden <code>extractJson</code> before trusting these numbers.
            </p>
          </section>
        )}

        {evaluatedItems.map((item) => (
          <section className="card" key={item.id}>
            <h3 className="card__title">
              {item.title} <span className="muted">· judge {results[item.id].judgeModel}</span>
            </h3>
            <div className="details">
              {(results[item.id].results || []).map((r) => (
                <Detail key={r.baseId} r={r} rtl={byCode(item.target)?.rtl} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

function Score({ v }) {
  if (v == null) return <span className="muted">—</span>
  const cls = v >= 90 ? 'score score--hi' : v >= 75 ? 'score score--mid' : 'score score--lo'
  return <span className={cls}>{v.toFixed(1)}</span>
}

function Detail({ r, rtl }) {
  const [open, setOpen] = useState(false)
  const j = r.judge
  return (
    <div className="detail">
      <div className="detail__head">
        <span className="detail__model">{r.label}</span>
        {r.error ? (
          <span className="bad">{r.error}</span>
        ) : (
          <span className="detail__scores">
            judge <Score v={j?.overall} /> · chrF {fmt(r.chrf)} ·{' '}
            <span className="muted">{(r.ms / 1000).toFixed(1)}s</span>
          </span>
        )}
      </div>

      {!r.error && j && !j.error && (
        <>
          <div className="crit">
            {CRITERIA.map((c) => (
              <span className="crit__item" key={c}>
                {c} <b>{j.scores?.[c] ?? '—'}</b>/5
              </span>
            ))}
          </div>
          {j.summary && <p className="detail__summary">{j.summary}</p>}
          {j.errors?.length > 0 && (
            <ul className="detail__errors">
              {j.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <button className="copy" onClick={() => setOpen((o) => !o)}>
            {open ? 'hide translation' : 'show translation'}
          </button>
          {open && (
            <pre className="detail__text" dir={rtl ? 'rtl' : 'ltr'}>
              {r.translation}
            </pre>
          )}
        </>
      )}
      {j?.error && <p className="bad small">judge: {j.error}</p>}
    </div>
  )
}
