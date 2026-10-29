import { byCode, isRtl } from '@/lib/languages'

// Builds a print-ready HTML document and opens the browser's print dialog,
// so users can save each translation as a PDF.

// A short document title derived from the first non-empty source line.
export function deriveTitle(text) {
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

export async function printTranslations({ title, items }) {
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
