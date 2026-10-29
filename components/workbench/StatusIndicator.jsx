// Small mono status label with a coloured marker. `tone` drives the colour.
// tones: idle | busy | done | error | stale | lime
export default function StatusIndicator({ tone = 'idle', children }) {
  return (
    <span className={`status-ind status-ind--${tone}`}>
      <span className="status-ind__dot" aria-hidden="true" />
      <span className="status-ind__label">{children}</span>
    </span>
  )
}
