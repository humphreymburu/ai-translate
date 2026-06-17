import { NextResponse } from 'next/server'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'

// Each test case is a JSON file in eval/testset/:
//   { "id", "title", "source": "en", "target": "ru",
//     "sourceText": "...", "reference": "..." }
// `reference` is optional — omit it for reference-free (source-only) judging.
const DIR = path.join(process.cwd(), 'eval', 'testset')

export async function GET() {
  let files
  try {
    files = (await readdir(DIR)).filter((f) => f.endsWith('.json'))
  } catch {
    return NextResponse.json({ items: [], note: 'No eval/testset directory yet.' })
  }

  const items = []
  for (const file of files.sort()) {
    try {
      const raw = await readFile(path.join(DIR, file), 'utf8')
      const data = JSON.parse(raw)
      items.push({
        id: data.id || file.replace(/\.json$/, ''),
        title: data.title || file,
        source: data.source || 'en',
        target: data.target,
        sourceText: data.sourceText || '',
        reference: data.reference || '',
        file,
      })
    } catch (err) {
      items.push({ id: file, title: file, error: `Failed to parse: ${err.message}` })
    }
  }
  return NextResponse.json({ items })
}
