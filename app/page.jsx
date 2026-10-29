'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { LANGUAGES, UN_TARGETS, isRtl, byCode } from '@/lib/languages'
import { deriveTitle, printTranslations } from '@/lib/print'
import Header from '@/components/workbench/Header'
import LanguageSelector from '@/components/workbench/LanguageSelector'
import SourceEditor from '@/components/workbench/SourceEditor'
import TranslationPanel from '@/components/workbench/TranslationPanel'

const SAMPLE =
  'The quick brown fox jumps over the lazy dog.\n\n' +
  'Please confirm your appointment for next Tuesday at 3 PM — let me know if anything changes.'

const SOURCES = LANGUAGES.filter((l) => l.code === 'en')
const DEFAULT_TARGETS = ['es', 'fr']

async function copyText(text) {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function Home() {
  const [input, setInput] = useState(SAMPLE)
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [results, setResults] = useState({}) // code -> { text, status, elapsed, error }
  const [status, setStatus] = useState('idle') // idle | translating | done
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [exportingAll, setExportingAll] = useState(false)
  const [modKey, setModKey] = useState('⌘')
  const controllersRef = useRef(new Map()) // code -> AbortController

  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    setModKey(mac ? '⌘' : 'Ctrl ')
  }, [])

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || [])
        setModel(data.defaultModel || data.models?.[0]?.baseId || '')
      })
      .catch(() => {})
  }, [])

  // Reset all results when the model changes — every panel is now stale.
  useEffect(() => {
    setResults({})
    setStatus('idle')
  }, [model])

  const toggleTarget = (code) => {
    setTargets((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  // Stream one language's translation into results[code].
  const translateOne = useCallback(
    async (code, text) => {
      const controller = new AbortController()
      controllersRef.current.set(code, controller)
      const started = performance.now()
      setResults((prev) => ({
        ...prev,
        [code]: { text: '', source: text, status: 'translating', elapsed: null, error: '' },
      }))
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, source: 'en', target: code, model }),
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
          [code]: { ...prev[code], status: 'error', error: err.message || 'Unknown error.' },
        }))
      } finally {
        if (controllersRef.current.get(code) === controller) controllersRef.current.delete(code)
      }
    },
    [model],
  )

  const translate = useCallback(async () => {
    if (!input.trim() || targets.length === 0 || status === 'translating') return
    setStatus('translating')
    await Promise.all(targets.map((code) => translateOne(code, input)))
    setStatus('done')
  }, [input, targets, status, translateOne])

  const regenerate = (code) => {
    if (!input.trim()) return
    translateOne(code, input)
  }

  const stop = () => {
    controllersRef.current.forEach((c) => c.abort())
  }

  // ⌘/Ctrl + Enter translates from anywhere on the page.
  const translateRef = useRef(translate)
  translateRef.current = translate
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        translateRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const exportOne = useCallback(
    async (code) => {
      const text = results[code]?.text
      if (!text) throw new Error('No translation to export.')
      await printTranslations({ title: deriveTitle(input), items: [{ code, text }] })
    },
    [results, input],
  )

  const exportAll = async () => {
    setExportingAll(true)
    try {
      const items = targets
        .filter((code) => results[code]?.status === 'done' && results[code]?.text)
        .map((code) => ({ code, text: results[code].text }))
      await printTranslations({ title: deriveTitle(input), items })
    } catch {
      // Pop-up blocked or nothing to export; the button simply re-enables.
    } finally {
      setExportingAll(false)
    }
  }

  const busy = status === 'translating'
  const chars = input.length
  const words = input.trim() ? input.trim().split(/\s+/).length : 0
  const activeModel = models.find((m) => m.baseId === model)
  const providerLabel = activeModel?.provider === 'qwen' ? 'Qwen (DashScope)' : 'Bedrock Converse'
  const finished = targets.filter((c) => results[c]?.status === 'done' && results[c]?.text)
  const isStale = (code) => !!results[code]?.text && results[code].source !== input
  const stale = targets.some(isStale)
  const progress = {
    done: targets.filter((c) => ['done', 'error'].includes(results[c]?.status)).length,
    total: targets.length,
  }
  const canTranslate = !!input.trim() && targets.length > 0

  let sourceStatus = { tone: 'idle', label: 'Ready to translate' }
  if (!input.trim()) sourceStatus = { tone: 'idle', label: 'Empty — type or paste text' }
  else if (busy) sourceStatus = { tone: 'busy', label: `Translating · ${progress.done} of ${progress.total}` }
  else if (stale) sourceStatus = { tone: 'stale', label: 'Edited since last translation' }
  else if (finished.length && !stale)
    sourceStatus = {
      tone: 'done',
      label: `Translated into ${finished.length} ${finished.length === 1 ? 'language' : 'languages'}`,
    }
  else if (targets.length === 0) sourceStatus = { tone: 'idle', label: 'Pick a target language' }

  const count = Math.min(targets.length, 6)

  return (
    <div className="shell">
      <Header
        sources={SOURCES}
        models={models}
        model={model}
        onModelChange={setModel}
        busy={busy}
        progress={progress}
        canTranslate={canTranslate}
        onTranslate={translate}
        onStop={stop}
        modKey={modKey}
      />

      <LanguageSelector
        languages={UN_TARGETS}
        selected={targets}
        onToggle={toggleTarget}
        disabled={busy}
        exportable={finished.length > 0}
        exporting={exportingAll}
        onExportAll={exportAll}
      />

      <main className="ws" data-count={count}>
        <SourceEditor
          language={byCode('en')}
          value={input}
          onChange={setInput}
          words={words}
          chars={chars}
          status={sourceStatus}
          mobileAction={
            busy ? (
              <button type="button" className="primary primary--sm primary--stop mobile-only" onClick={stop}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="primary primary--sm mobile-only"
                onClick={translate}
                disabled={!canTranslate}
              >
                Translate
              </button>
            )
          }
        />

        <div className="ws__outputs" aria-live="polite">
          {targets.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No target language selected</p>
              <p className="empty__body">Pick one or more languages above. Each gets its own panel here.</p>
            </div>
          ) : (
            targets.map((code) => (
              <TranslationPanel
                key={code}
                language={byCode(code)}
                rtl={isRtl(code)}
                result={results[code]}
                stale={isStale(code)}
                onCopy={copyText}
                onExport={exportOne}
                onRegenerate={() => regenerate(code)}
                canRegenerate={!!input.trim() && !busy && !!model}
              />
            ))
          )}
        </div>
      </main>

      <footer className="foot">
        <span>
          <span className="foot__k">Model</span> {activeModel?.label || model || '…'}
          <span className="foot__sep">/</span>
          {targets.length} {targets.length === 1 ? 'language' : 'languages'} via {providerLabel}
        </span>
        <span>
          <kbd>{modKey.trim()}</kbd> + <kbd>Enter</kbd> translates all
        </span>
      </footer>
    </div>
  )
}
