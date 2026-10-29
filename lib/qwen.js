// Minimal Qwen client for Alibaba DashScope / Model Studio's OpenAI-compatible
// endpoint. Used as an alternative translation provider to Bedrock, so the
// workbench and eval harness keep working when the Bedrock bearer token has
// expired (or when you want a cross-provider comparison).
//
// Requires QWEN_API_KEY. The key is region-scoped: international keys only work
// against dashscope-intl.aliyuncs.com (Singapore), China keys only against
// dashscope.aliyuncs.com. Override the endpoint with QWEN_BASE_URL.

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

function baseUrl() {
  return (process.env.QWEN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

// Deterministic output, same rationale as the Bedrock client: reproducible evals.
const INFERENCE = { temperature: 0, max_tokens: 4096 }

export class QwenError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'QwenError'
    this.status = status
    this.code = code
  }
}

function requireKey() {
  const key = process.env.QWEN_API_KEY
  if (!key) {
    throw new QwenError(
      'QWEN_API_KEY is not set. Add a DashScope / Model Studio key to .env.',
      { code: 'missing_api_key' },
    )
  }
  return key
}

function messagesFor(system, text) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: text })
  return messages
}

async function post({ model, system, text, temperature, maxTokens, stream }) {
  const key = requireKey()
  const url = `${baseUrl()}/chat/completions`

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messagesFor(system, text),
        temperature: temperature ?? INFERENCE.temperature,
        max_tokens: maxTokens ?? INFERENCE.max_tokens,
        ...(stream ? { stream: true } : {}),
      }),
      signal: AbortSignal.timeout(300_000),
    })
  } catch (err) {
    throw new QwenError(`Could not reach Qwen at ${baseUrl()}: ${err?.message || err}`, {
      code: 'network_error',
    })
  }

  if (!res.ok) {
    let message = res.statusText
    let code
    try {
      const body = await res.json()
      message = body?.error?.message || JSON.stringify(body)
      code = body?.error?.code
    } catch {
      message = await res.text().catch(() => '') || message
    }
    throw new QwenError(message, { status: res.status, code })
  }

  return res
}

// One-shot translation, mirrors converseOnce(): { text, ms, modelId }.
export async function qwenComplete({ model, system, text, temperature = 0, maxTokens = 4096 }) {
  const started = Date.now()
  const res = await post({ model, system, text, temperature, maxTokens, stream: false })
  const data = await res.json().catch(() => null)
  const reply = data?.choices?.[0]?.message?.content ?? ''
  if (!reply && data?.error) {
    throw new QwenError(data.error.message || 'Qwen returned an error.', {
      code: data.error.code,
    })
  }
  return { text: reply.trim(), ms: Date.now() - started, modelId: model }
}

// Streaming translation, mirrors converseStream(): { modelId, chunks() }.
export async function qwenStream({ model, system, text }) {
  const res = await post({ model, system, text, stream: true })
  if (!res.body) throw new QwenError('Qwen returned an empty stream.')

  return {
    modelId: model,
    async *chunks() {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (value) buffer += decoder.decode(value, { stream: true })
          // Flush the decoder and terminate the last line when the stream ends.
          if (done) buffer += `${decoder.decode()}\n`

          let newline
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, '')
            buffer = buffer.slice(newline + 1)
            if (!line.startsWith('data:')) continue

            const payload = line.slice(5).trim()
            if (payload === '[DONE]') return
            if (!payload) continue

            let event
            try {
              event = JSON.parse(payload)
            } catch {
              continue // keep-alive or partial frame — ignore
            }
            if (event?.error) {
              throw new QwenError(event.error.message || 'Qwen stream error.', {
                code: event.error.code,
              })
            }
            const delta = event?.choices?.[0]?.delta?.content
            if (delta) yield delta
          }

          if (done) return
        }
      } finally {
        // Release the connection if the consumer stops early (aborted request).
        try {
          await reader.cancel()
        } catch {
          /* already closed */
        }
      }
    },
  }
}

// Map a Qwen/HTTP error to an actionable message, mirroring describeError().
export function describeQwenError(err, modelId) {
  const model = modelId || 'the selected model'
  const code = err?.code

  if (code === 'missing_api_key') return err.message
  if (err?.status === 401 || code === 'invalid_api_key') {
    return `Qwen rejected the API key (401 invalid_api_key). Keys are region-scoped: an international key must use dashscope-intl.aliyuncs.com, a China key dashscope.aliyuncs.com — set QWEN_BASE_URL to match.`
  }
  if (err?.status === 403) {
    return `Access denied for "${model}" on Qwen (403). Confirm the model is enabled for this Model Studio workspace.`
  }
  if (code === 'model_not_found' || err?.status === 404) {
    return `Qwen model "${model}" was not found or is not available to this key.`
  }
  if (err?.status === 429) {
    return `Qwen rate limit or quota exceeded for "${model}". Retry shortly or check the Model Studio quota.`
  }
  if (err?.status >= 500) {
    return `Qwen is unavailable right now (${err.status}). ${err.message || ''}`.trim()
  }
  if (code === 'network_error') return err.message
  return err?.message || 'Qwen request failed.'
}
