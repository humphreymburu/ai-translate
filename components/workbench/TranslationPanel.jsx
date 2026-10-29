'use client'

import { useState, useEffect, useRef } from 'react'
import Icon from './Icon'
import StatusIndicator from './StatusIndicator'

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/

function measure(text) {
  if (!text) return ''
  if (CJK.test(text)) return `${text.replace(/\s/g, '').length} chars`
  const n = text.trim().split(/\s+/).length
  return `${n} ${n === 1 ? 'word' : 'words'}`
}

function Skeleton({ animated }) {
  return (
    <div className={`skeleton ${animated ? 'skeleton--live' : ''}`} aria-hidden="true">
      <span style={{ width: '92%' }} />
      <span style={{ width: '78%' }} />
      <span style={{ width: '85%' }} />
      <span className="skeleton__gap" />
      <span style={{ width: '88%' }} />
      <span style={{ width: '54%' }} />
    </div>
  )
}

export default function TranslationPanel({
  language,
  rtl,
  result,
  stale,
  onCopy,
  onExport,
  onRegenerate,
  canRegenerate,
}) {
  const code = language?.code
  const { text = '', status = 'idle', elapsed = null, error = '' } = result || {}
  const busy = status === 'translating'
  const done = status === 'done' && !!text
  const [copied, setCopied] = useState(false)
  const [pdfState, setPdfState] = useState('idle') // idle | working | error
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  const copy = async () => {
    if (await onCopy(text)) {
      setCopied(true)
      later(() => setCopied(false), 1500)
    }
  }

  const exportPdf = async () => {
    setPdfState('working')
    try {
      await onExport(code)
      setPdfState('idle')
    } catch {
      setPdfState('error')
      later(() => setPdfState('idle'), 2500)
    }
  }

  const state = status === 'error' ? 'error' : busy ? 'busy' : done ? (stale ? 'stale' : 'done') : 'idle'
  const statusLabel = {
    idle: 'Waiting',
    busy: 'Translating',
    done: 'Done',
    stale: 'Outdated',
    error: 'Failed',
  }[state]

  let meta = 'No output yet'
  if (busy) meta = text ? `${measure(text)} · streaming` : 'Contacting model…'
  else if (state === 'error') meta = 'Request failed'
  else if (done) meta = [measure(text), elapsed && `${elapsed}s`].filter(Boolean).join(' · ')

  return (
    <section className={`panel panel--out is-${state}`} aria-labelledby={`out-${code}`} aria-busy={busy}>
      <span className="rail" aria-hidden="true" />
      <div className="panel__head">
        <div className="panel__title">
          <h2 id={`out-${code}`} lang={code}>
            {language?.native}
          </h2>
          <span className="tag">{code?.split('-')[0]}</span>
        </div>
        <div className="panel__actions">
          <StatusIndicator tone={state}>{statusLabel}</StatusIndicator>
          <button
            type="button"
            className={`iconbtn ${copied ? 'iconbtn--ok' : ''}`}
            onClick={copy}
            disabled={!text || busy}
            aria-label={copied ? 'Copied' : `Copy ${language?.label} translation`}
            data-tip={copied ? 'Copied' : 'Copy'}
          >
            <Icon name={copied ? 'check' : 'copy'} size={15} />
          </button>
        </div>
      </div>

      <div className="output" dir={rtl ? 'rtl' : 'ltr'} lang={code}>
        {state === 'error' ? (
          <div className="errorbox" role="alert" dir="ltr" lang="en">
            <Icon name="alert" size={18} />
            <div>
              <p className="errorbox__title">The {language?.label} translation didn’t finish.</p>
              <p className="errorbox__msg">{error}</p>
              <button type="button" className="ghost ghost--sm" onClick={onRegenerate} disabled={!canRegenerate}>
                <Icon name="refresh" size={13} />
                Retry {language?.label}
              </button>
            </div>
          </div>
        ) : text ? (
          <p className="output__text">
            {text}
            {busy && <span className="caret" aria-hidden="true" />}
          </p>
        ) : (
          <div className="waiting">
            <Skeleton animated={busy} />
            {!busy && (
              <p className="waiting__hint" dir="ltr">
                The {language?.label} translation will appear here.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="panel__foot">
        <span className="meta">{stale && done ? 'Source edited · regenerate to update' : meta}</span>
        <div className="panel__actions">
          <button
            type="button"
            className="iconbtn"
            onClick={onRegenerate}
            disabled={!canRegenerate || busy}
            aria-label={`Regenerate ${language?.label} translation`}
            data-tip="Regenerate"
          >
            <Icon name="refresh" size={14} />
          </button>
          <button
            type="button"
            className="ghost ghost--sm"
            onClick={exportPdf}
            disabled={!done || pdfState === 'working'}
            title={done ? `Save the ${language?.label} translation as a PDF` : 'Available once translated'}
          >
            <Icon name="download" size={13} />
            {pdfState === 'working' ? 'Building…' : pdfState === 'error' ? 'Retry PDF' : 'PDF'}
          </button>
        </div>
      </div>
    </section>
  )
}
