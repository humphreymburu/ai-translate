import StatusIndicator from './StatusIndicator'

export default function SourceEditor({
  language,
  value,
  onChange,
  onKeyDown,
  words,
  chars,
  status,
  mobileAction,
}) {
  return (
    <section className="panel panel--source" aria-labelledby="source-title">
      <span className="rail rail--source" aria-hidden="true" />
      <div className="panel__head">
        <div className="panel__title">
          <h2 id="source-title">{language?.label || 'English'}</h2>
          <span className="tag tag--lime">Source</span>
        </div>
        <span className="meta" aria-live="off">
          {words} {words === 1 ? 'word' : 'words'} · {chars} chars
        </span>
      </div>

      <textarea
        className="editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type or paste the text you want to translate…"
        spellCheck={false}
        aria-label="Source text"
        lang={language?.code || 'en'}
      />

      <div className="panel__foot">
        <StatusIndicator tone={status.tone}>{status.label}</StatusIndicator>
        {mobileAction}
      </div>
    </section>
  )
}
