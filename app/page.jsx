
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { LANGUAGES, UN_TARGETS, isRtl, byCode } from '@/lib/languages'

const SAMPLE =
  'The quick brown fox jumps over the lazy dog.\n\n' +
  'Please confirm your appointment for next Tuesday at 3 PM — let me know if anything changes.'

const SOURCES = LANGUAGES.filter((l) => l.code === 'en')
const DEFAULT_TARGETS = ['es', 'fr']

function ModelSelect({ value, onChange, models }) {
  return (
    <label className="lang" htmlFor="model">
      <span className="lang__label">model</span>
      <select id="model" value={value} onChange={(e) => onChange(e.target.value)}>
        {models.map((m) => (
          <option key={m.baseId} value={m.baseId}>
            {m.label} · {m.family}
          </option>
        ))}
      </select>
    </label>
  )
}

// A short document title derived from the first non-empty source line.
function deriveTitle(text) {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) || ''
  return first.length > 80 ? `${first.slice(0, 80)}…` : first
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textToParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

function buildPrintHtml({ title, items }) {
  const sections = items
    .map(({ code, text }) => {
      const lang = byCode(code)
      const dir = isRtl(code) ? 'rtl' : 'ltr'
      const native = lang?.native || code
      const label = lang?.label || code

      return `<section class="doc" lang="${escapeHtml(code)}" dir="${dir}">
  <header class="masthead">
    <div class="native">${escapeHtml(native)}</div>
    <div class="sub">${escapeHtml(label)} translation${title ? ` · ${escapeHtml(title)}` : ''}</div>
  </header>
  ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
  <main>${textToParagraphs(text)}</main>
</section>`
    })
    .join('\n')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || 'Translation')}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #16181d; background: #fff; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
      "Noto Sans Arabic", "Noto Sans SC", Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.7;
  }
  .doc { break-after: page; page-break-after: always; }
  .doc:last-child { break-after: auto; page-break-after: auto; }
  .masthead {
    border-bottom: 2px solid #16181d;
    padding-bottom: 10px;
    margin-bottom: 22px;
    direction: ltr;
    text-align: left;
  }
  .native { font-size: 18pt; font-weight: 700; line-height: 1.2; }
  .sub {
    margin-top: 4px;
    font-size: 9.5pt;
    color: #6b7280;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  h1 { font-size: 13pt; font-weight: 700; margin: 0 0 16px; }
  p { margin: 0 0 12px; text-align: justify; }
  [dir="rtl"] p { text-align: right; }
</style>
</head>
<body>${sections}</body>
</html>`
}

async function printTranslations({ title, items }) {
  if (!items.length) throw new Error('No translations to export.')
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Allow pop-ups to export PDFs.')
  printWindow.opener = null

  printWindow.document.open()
  printWindow.document.write(buildPrintHtml({ title, items }))
  printWindow.document.close()

  await new Promise((resolve) => {
    if (printWindow.document.readyState === 'complete') resolve()
    else printWindow.addEventListener('load', resolve, { once: true })
  })
  await printWindow.document.fonts?.ready
  printWindow.focus()
  printWindow.print()
}

function ResultCard({ code, result, onCopy, onDownload }) {
  const lang = byCode(code)
  const rtl = isRtl(code)
  const { text = '', status = 'idle', elapsed = null, error = '' } = result || {}
  const busy = status === 'translating'
  const [copied, setCopied] = useState(false)
  const [pdfState, setPdfState] = useState('idle') // idle | working | error

  const copy = async () => {
    const ok = await onCopy(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const download = async () => {
    setPdfState('working')
    try {
      await onDownload(code)
      setPdfState('idle')
    } catch {
      setPdfState('error')
      setTimeout(() => setPdfState('idle'), 2500)
    }
  }

  return (
    <section className="rcard">
      <div className="pane__head">
        <span className="pane__lang">
          {lang?.native} <span className="rcard__code">{code}</span>
        </span>
        <span className="pane__meta">
          {status === 'done' && elapsed && <span className="ok">{elapsed}s</span>}
          {busy && <span className="live">translating…</span>}
          <button className="copy" onClick={copy} disabled={!text}>
            {copied ? 'copied' : 'copy'}
          </button>
        </span>
      </div>

      <div className={`rcard__body ${rtl ? 'output--rtl' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
        {error ? (
          <p className="output__error">{error}</p>
        ) : text ? (
          <>
            {text}
            {busy && <span className="caret" />}
          </>
        ) : (
          <p className="output__hint">{busy ? <span className="caret" /> : 'Waiting…'}</p>
        )}
      </div>

      <div className="rcard__foot">
        <button
          className="pdfbtn"
          onClick={download}
          disabled={status !== 'done' || !text || pdfState === 'working'}
        >
          {pdfState === 'working'
            ? 'building…'
            : pdfState === 'error'
              ? 'failed — retry'
              : 'PDF'}
        </button>
      </div>
    </section>
  )
}

export default function Home() {
  const [input, setInput] = useState(SAMPLE)
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [results, setResults] = useState({}) // code -> { text, status, elapsed, error }
  const [status, setStatus] = useState('idle') // idle | translating | done
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [downloadingAll, setDownloadingAll] = useState(false)
  const controllersRef = useRef([])

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || [])
        setModel(data.defaultModel || data.models?.[0]?.baseId || '')
      })
      .catch(() => {})
  }, [])

  const toggleTarget = (code) => {
    setTargets((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  // Stream one language's translation into results[code].
  const translateOne = useCallback(
    async (code, controller) => {
      const started = performance.now()
      setResults((prev) => ({
        ...prev,
        [code]: { text: '', status: 'translating', elapsed: null, error: '' },
      }))
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input, source: 'en', target: code, model }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          let msg = `Request failed (${res.status})`
          try {
            const data = await res.json()
            if (data?.error) msg = data.error
          } catch {}
          throw new Error(msg)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          setResults((prev) => ({ ...prev, [code]: { ...prev[code], text: acc } }))
        }
        setResults((prev) => ({
          ...prev,
          [code]: {
            ...prev[code],
            status: 'done',
            elapsed: ((performance.now() - started) / 1000).toFixed(1),
          },
        }))
      } catch (err) {
        if (err.name === 'AbortError') {
          setResults((prev) => ({
            ...prev,
            [code]: { ...prev[code], status: prev[code]?.text ? 'done' : 'idle' },
          }))
          return
        }
        setResults((prev) => ({
          ...prev,
          [code]: { ...prev[code], status: 'error', error: err.message || 'Failed.' },
        }))
      }
    },
    [input, model],
  )

  const translate = useCallback(async () => {
    if (!input.trim() || targets.length === 0 || status === 'translating') return
    setStatus('translating')
    controllersRef.current = targets.map(() => new AbortController())
    await Promise.all(targets.map((code, i) => translateOne(code, controllersRef.current[i])))
    controllersRef.current = []
    setStatus('done')
  }, [input, targets, status, translateOne])

  const stop = () => {
    controllersRef.current.forEach((c) => c.abort())
  }

  const copyText = async (text) => {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  const downloadPdf = useCallback(
    async (code) => {
      const text = results[code]?.text
      if (!text) throw new Error('No translation to export.')
      await printTranslations({ title: deriveTitle(input), items: [{ code, text }] })
    },
    [results, input],
  )

  const downloadAll = async () => {
    setDownloadingAll(true)
    try {
      const items = targets
        .filter((code) => results[code]?.status === 'done' && results[code]?.text)
        .map((code) => ({ code, text: results[code].text }))
      await printTranslations({ title: deriveTitle(input), items })
    } finally {
      setDownloadingAll(false)
    }
  }

  const onInputKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      translate()
    }
  }

  // Reset all results when the model changes — every card is now stale.
  useEffect(() => {
    setResults({})
    setStatus('idle')
  }, [model])

  const busy = status === 'translating'
  const chars = input.length
  const words = input.trim() ? input.trim().split(/\s+/).length : 0
  const activeModel = models.find((m) => m.baseId === model)
  const anyDone = targets.some((c) => results[c]?.status === 'done' && results[c]?.text)

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <span className="brand__mark">◈</span>
          <span className="brand__name">TRANSLATE</span>
          <span className="brand__sub">workbench</span>
          <Link className="navlink" href="/eval">
            eval →
          </Link>
        </div>

        <div className="controls">
          <label className="lang" htmlFor="src">
            <span className="lang__label">from</span>
            <select id="src" value="en" disabled>
              {SOURCES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} · {l.code}
                </option>
              ))}
            </select>
          </label>

          {models.length > 0 && (
            <ModelSelect value={model} onChange={setModel} models={models} />
          )}

          {busy ? (
            <button className="run run--stop" onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              className="run"
              onClick={translate}
              disabled={!input.trim() || targets.length === 0}
            >
              Translate
              <kbd>⌘↵</kbd>
            </button>
          )}
        </div>
      </header>

      <div className="targets">
        <span className="lang__label targets__label">into</span>
        <div className="chips">
          {UN_TARGETS.map((l) => {
            const on = targets.includes(l.code)
            return (
              <button
                key={l.code}
                type="button"
                className={`chip ${on ? 'chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleTarget(l.code)}
                disabled={busy}
              >
                <span className="chip__box" aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
                {l.native}
                <span className="chip__code">{l.code}</span>
              </button>
            )
          })}
        </div>
        <button
          className="pdfbtn pdfbtn--all"
          onClick={downloadAll}
          disabled={!anyDone || downloadingAll}
        >
          {downloadingAll ? 'building…' : 'PDF all'}
        </button>
      </div>

      <main className="panes panes--batch">
        <section className="pane">
          <div className="pane__head">
            <span className="pane__lang">{byCode('en')?.native}</span>
            <span className="pane__meta">
              {words} {words === 1 ? 'word' : 'words'} · {chars} chars
            </span>
          </div>
          <textarea
            className="editor"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Type or paste text to translate…"
            spellCheck={false}
          />
        </section>

        <section className="results" aria-live="polite">
          {targets.length === 0 ? (
            <p className="results__empty">Select one or more languages above to translate into.</p>
          ) : (
            <div className="results__grid">
              {targets.map((code) => (
                <ResultCard
                  key={code}
                  code={code}
                  result={results[code]}
                  onCopy={copyText}
                  onDownload={downloadPdf}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="status">
        <span>
          model <code>{activeModel?.label || model || '…'}</code> · {targets.length}{' '}
          {targets.length === 1 ? 'language' : 'languages'} via Bedrock Converse
        </span>
        <span className="status__hint">⌘/Ctrl + Enter to translate all</span>
      </footer>
    </div>
  )
}
