
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { LANGUAGES, isRtl, byCode } from '@/lib/languages'

const SAMPLE =
  'The quick brown fox jumps over the lazy dog.\n\n' +
  'Please confirm your appointment for next Tuesday at 3 PM — let me know if anything changes.'

const SOURCES = LANGUAGES.filter((l) => l.code === 'en')
const TARGETS = LANGUAGES.filter((l) => l.code !== 'en')

function LangSelect({ value, onChange, id, label, options = LANGUAGES, disabled = false }) {
  return (
    <label className="lang" htmlFor={id}>
      <span className="lang__label">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label} · {l.code}
          </option>
        ))}
      </select>
    </label>
  )
}

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

export default function Home() {
  const [source, setSource] = useState('en')
  const [target, setTarget] = useState('es')
  const [input, setInput] = useState(SAMPLE)
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(null)
  const [copied, setCopied] = useState(false)
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const abortRef = useRef(null)

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || [])
        setModel(data.defaultModel || data.models?.[0]?.baseId || '')
      })
      .catch(() => {})
  }, [])

  const translate = useCallback(async () => {
    if (!input.trim() || status === 'translating') return
    setStatus('translating')
    setOutput('')
    setError('')
    setElapsed(null)
    setCopied(false)

    const started = performance.now()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, source, target, model }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`
        try {
          const data = await res.json()
          if (data?.error) msg = data.error
        } catch {
        }
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setOutput(acc)
      }
      setElapsed(((performance.now() - started) / 1000).toFixed(1))
      setStatus('done')
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus(output ? 'done' : 'idle')
        return
      }
      setError(err.message || 'Something went wrong.')
      setStatus('error')
    } finally {
      abortRef.current = null
    }
  }, [input, source, target, model, status, output])

  const stop = () => abortRef.current?.abort()

  const copyOut = async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
    }
  }

  const onInputKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      translate()
    }
  }

  useEffect(() => {
    setOutput('')
    setStatus('idle')
    setError('')
    setElapsed(null)
  }, [source, target, model])

  const rtlIn = isRtl(source)
  const rtlOut = isRtl(target)
  const busy = status === 'translating'
  const chars = input.length
  const words = input.trim() ? input.trim().split(/\s+/).length : 0
  const activeModel = models.find((m) => m.baseId === model)

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
          <LangSelect
            id="src"
            label="from"
            value={source}
            onChange={setSource}
            options={SOURCES}
            disabled
          />
          <LangSelect
            id="tgt"
            label="to"
            value={target}
            onChange={setTarget}
            options={TARGETS}
          />
          {models.length > 0 && (
            <ModelSelect value={model} onChange={setModel} models={models} />
          )}

          {busy ? (
            <button className="run run--stop" onClick={stop}>
              Stop
            </button>
          ) : (
            <button className="run" onClick={translate} disabled={!input.trim()}>
              Translate
              <kbd>⌘↵</kbd>
            </button>
          )}
        </div>
      </header>

      <main className="panes">
        <section className="pane">
          <div className="pane__head">
            <span className="pane__lang">{byCode(source)?.native}</span>
            <span className="pane__meta">
              {words} {words === 1 ? 'word' : 'words'} · {chars} chars
            </span>
          </div>
          <textarea
            className="editor"
            dir={rtlIn ? 'rtl' : 'ltr'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Type or paste text to translate…"
            spellCheck={false}
          />
        </section>

        <div className="seam" aria-hidden="true">
          <span className={`seam__dot ${busy ? 'seam__dot--live' : ''}`} />
        </div>

        <section className="pane pane--out">
          <div className="pane__head">
            <span className="pane__lang">{byCode(target)?.native}</span>
            <span className="pane__meta">
              {status === 'done' && elapsed && <span className="ok">done · {elapsed}s</span>}
              {busy && <span className="live">translating…</span>}
              <button className="copy" onClick={copyOut} disabled={!output}>
                {copied ? 'copied' : 'copy'}
              </button>
            </span>
          </div>
          <div
            className={`output ${rtlOut ? 'output--rtl' : ''}`}
            dir={rtlOut ? 'rtl' : 'ltr'}
          >
            {error ? (
              <p className="output__error">{error}</p>
            ) : output ? (
              <>
                {output}
                {busy && <span className="caret" />}
              </>
            ) : (
              <p className="output__hint">
                {busy ? <span className="caret" /> : 'Translation will appear here.'}
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="status">
        <span>
          model <code>{activeModel?.label || model || '…'}</code> via Bedrock Converse
        </span>
        <span className="status__hint">⌘/Ctrl + Enter to translate</span>
      </footer>
    </div>
  )
}
