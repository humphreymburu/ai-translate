import { buildHtml, renderPdf } from '@/lib/pdf'
import { UN_TARGET_CODES, byCode } from '@/lib/languages'

export const runtime = 'nodejs'
// PDF generation (Chromium launch + layout) can exceed the default budget.
export const maxDuration = 60

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(request) {
  const { code, title = '', text } = await request.json()

  if (!UN_TARGET_CODES.includes(code)) {
    return jsonError(`Unsupported PDF language: "${code}".`)
  }
  if (!text || !text.trim()) {
    return jsonError('Nothing to render — the translation is empty.')
  }

  try {
    const html = buildHtml({ code, title, text })
    const pdf = await renderPdf(html)
    const filename = `translation-${code}.pdf`

    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[pdf] error:', err?.name, err?.message)
    return jsonError(err?.message || 'PDF generation failed.', 500)
  }
}
