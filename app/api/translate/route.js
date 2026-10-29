import { buildSystemPrompt, LANGUAGE_NAMES } from '@/lib/prompt'
import { defaultBaseId, isKnownModel, providerOf, resolveModelId } from '@/lib/models'
import { describeProviderError, translateStream } from '@/lib/providers'

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(request) {
  const { text, source = 'en', target, model } = await request.json()

  if (!text || !text.trim()) {
    return jsonError('Nothing to translate — the source pane is empty.')
  }
  if (!LANGUAGE_NAMES[target]) {
    return jsonError(`Unsupported target language: "${target}".`)
  }

  const baseId = model && isKnownModel(model) ? model : defaultBaseId()
  const modelId = resolveModelId(baseId)
  const systemPrompt = buildSystemPrompt(source, target)

  try {
    const { chunks } = await translateStream({ baseId, system: systemPrompt, text })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of chunks()) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Model-Id': modelId,
        'X-Provider': providerOf(baseId),
      },
    })
  } catch (err) {
    console.error('[translate] error:', err?.name, err?.message)
    return jsonError(describeProviderError(err, baseId), 500)
  }
}
