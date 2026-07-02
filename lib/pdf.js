// Server-side PDF generation for translations. We render an HTML document with
// headless Chromium (Puppeteer) rather than a pure-JS PDF lib because Chromium
// handles the hard parts for free: Arabic shaping + bidi, CJK glyphs, and
// Cyrillic. Fonts are bundled Noto files referenced by file:// URL (Chromium
// memory-maps them, so even the ~18MB Chinese font costs nothing to embed).

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer'
import { byCode } from '@/lib/languages'
import { languageName } from '@/lib/prompt'

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts')
const fontUrl = (file) => pathToFileURL(path.join(FONT_DIR, file)).href

// Pick the family that covers a language's script. Latin + Cyrillic share
// Noto Sans; Arabic and Simplified Chinese need their dedicated Noto faces.
function fontFamily(code) {
  if (code === 'ar') return "'Noto Sans Arabic'"
  if (code === 'zh-hans') return "'Noto Sans SC'"
  return "'Noto Sans'"
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Turn the translated text into paragraphs, preserving blank-line breaks.
function paragraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function buildHtml({ code, title, text }) {
  const lang = byCode(code)
  const dir = lang?.rtl ? 'rtl' : 'ltr'
  const native = lang?.native || code
  const english = languageName(code, code)
  const family = fontFamily(code)

  return `<!doctype html>
<html lang="${code}" dir="${dir}">
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Noto Sans';
    src: url('${fontUrl('NotoSans-Regular.ttf')}') format('truetype');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Noto Sans';
    src: url('${fontUrl('NotoSans-Bold.ttf')}') format('truetype');
    font-weight: 700;
  }
  @font-face {
    font-family: 'Noto Sans Arabic';
    src: url('${fontUrl('NotoSansArabic-Regular.ttf')}') format('truetype');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Noto Sans Arabic';
    src: url('${fontUrl('NotoSansArabic-Bold.ttf')}') format('truetype');
    font-weight: 700;
  }
  @font-face {
    font-family: 'Noto Sans SC';
    src: url('${fontUrl('NotoSansSC.ttf')}') format('truetype');
    font-weight: 400 700;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${family}, 'Noto Sans', sans-serif;
    color: #16181d;
    font-size: 12pt;
    line-height: 1.7;
  }
  .doc { padding: 0; }
  header.masthead {
    border-bottom: 2px solid #16181d;
    padding-bottom: 10px;
    margin-bottom: 22px;
    /* header meta is always LTR regardless of body direction */
    direction: ltr;
    text-align: left;
  }
  .masthead .native {
    font-size: 18pt;
    font-weight: 700;
    line-height: 1.2;
  }
  .masthead .sub {
    margin-top: 4px;
    font-size: 9.5pt;
    color: #6b7280;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  h1.title {
    font-size: 13pt;
    font-weight: 700;
    margin: 0 0 16px;
  }
  p { margin: 0 0 12px; text-align: ${dir === 'rtl' ? 'right' : 'justify'}; }
</style>
</head>
<body>
  <div class="doc">
    <header class="masthead">
      <div class="native">${escapeHtml(native)}</div>
      <div class="sub">${escapeHtml(english)} translation${
        title ? ` · ${escapeHtml(title)}` : ''
      }</div>
    </header>
    ${title ? `<h1 class="title">${escapeHtml(title)}</h1>` : ''}
    ${paragraphs(text)}
  </div>
</body>
</html>`
}

// Reuse a single browser across requests, mirroring the lazy singleton pattern
// used by getClient() in lib/bedrock.js. --no-sandbox is required in most Linux
// containers / WSL; --allow-file-access-from-files lets the setContent page load
// the bundled fonts by file:// URL.
let _browser
async function getBrowser() {
  if (!_browser || !_browser.connected) {
    _browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--allow-file-access-from-files'],
    })
  }
  return _browser
}

export async function renderPdf(html) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    // Ensure the bundled @font-face files have finished loading before printing,
    // otherwise Chromium may lay out with a fallback and drop CJK/Arabic glyphs.
    await page.evaluate(() => document.fonts.ready)
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;text-align:center;font-size:8px;color:#9aa0a6;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    })
  } finally {
    await page.close()
  }
}
