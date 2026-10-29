import Link from 'next/link'

export function BrandMark() {
  // Two offset squares: the source and its translation.
  return (
    <span className="mark" aria-hidden="true">
      <span className="mark__back" />
      <span className="mark__front" />
    </span>
  )
}

export function Brand({ badge }) {
  return (
    <div className="brand">
      <BrandMark />
      <div className="brand__text">
        <span className="brand__name">Translate</span>
        <span className="brand__sub">Workbench</span>
      </div>
      {badge}
    </div>
  )
}

function Field({ id, label, children }) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  )
}

export default function Header({
  sources,
  models,
  model,
  onModelChange,
  busy,
  progress,
  canTranslate,
  onTranslate,
  onStop,
  modKey,
}) {
  return (
    <header className="hdr">
      <div className="hdr__inner">
        <Brand
          badge={
            <Link className="badge" href="/eval" title="Compare models on a test set">
              Eval
            </Link>
          }
        />

        <div className="hdr__controls">
          <Field id="src" label="From">
            <select id="src" value="en" disabled aria-label="Source language">
              {sources.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} · {l.code.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>

          <Field id="model" label="Model">
            <select
              id="model"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={busy || models.length === 0}
            >
              {models.length === 0 && <option value="">Loading…</option>}
              {models.map((m) => (
                <option key={m.baseId} value={m.baseId}>
                  {m.label} · {m.family}
                </option>
              ))}
            </select>
          </Field>

          {busy ? (
            <button type="button" className="primary primary--stop" onClick={onStop}>
              <span className="spinner" aria-hidden="true" />
              Stop
              <span className="primary__meta">
                {progress.done}/{progress.total}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={onTranslate}
              disabled={!canTranslate}
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              Translate
              <kbd className="primary__kbd">{modKey}↵</kbd>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
