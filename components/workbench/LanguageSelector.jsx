import Icon from './Icon'

export default function LanguageSelector({
  languages,
  selected,
  onToggle,
  disabled,
  exportable,
  exporting,
  onExportAll,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar__inner">
        <span className="eyebrow" id="targets-label">
          Target languages
        </span>

        <div className="chips" role="group" aria-labelledby="targets-label">
          {languages.map((l) => {
            const on = selected.includes(l.code)
            return (
              <button
                key={l.code}
                type="button"
                className={`chip ${on ? 'chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => onToggle(l.code)}
                disabled={disabled}
                title={l.label}
              >
                <span className="chip__box" aria-hidden="true">
                  <svg viewBox="0 0 12 12" width="10" height="10">
                    <path d="M2.5 6.2 5 8.6l4.5-5" />
                  </svg>
                </span>
                <span className="chip__name" lang={l.code}>
                  {l.native}
                </span>
                <span className="chip__code">{l.code.split('-')[0]}</span>
              </button>
            )
          })}
        </div>

        <div className="toolbar__end">
          <span className="count" aria-live="polite">
            <b>{String(selected.length).padStart(2, '0')}</b> / {String(languages.length).padStart(2, '0')}{' '}
            selected
          </span>
          <button
            type="button"
            className="ghost"
            onClick={onExportAll}
            disabled={!exportable || exporting}
            title={exportable ? 'Save every finished translation as one PDF' : 'Translate first to export'}
          >
            <Icon name="download" size={14} />
            {exporting ? 'Building…' : 'Export all PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
