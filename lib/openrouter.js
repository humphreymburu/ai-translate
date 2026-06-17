// Minimal OpenRouter client (OpenAI-compatible chat completions). Used as an
// alternative provider for the eval judge so it can run on a non-Bedrock,
// different-family model (e.g. Google Gemma) to reduce self-preference bias.
//
// Requires OPENROUTER_API_KEY. Free models (…:free) still need the key; they
// are rate-limited and may log prompts — fine for evals, not for sensitive data.
//
// Because the eval harness fans candidates out with Promise.all, judge calls
// would otherwise hit OpenRouter concurrently and trip free-tier limits. We
// serialize them through a small concurrency gate and retry on HTTP 429.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

// Free tier is the common case → default to 1 in-flight request. Raise via
// OPENROUTER_MAX_CONCURRENCY if you're on a paid key.
const MAX_CONCURRENCY = Math.max(1, Number(process.env.OPENROUTER_MAX_CONCURRENCY) || 1)
const MAX_RETRIES = 3

// A model id is OpenRouter-shaped (vs a Bedrock id) when it looks like
// "vendor/model" — Bedrock ids are dot-separated (eu.amazon.nova-pro-v1:0).
export function isOpenRouterId(id) {
  return typeof id === 'string' && id.includes('/')
}

// ── tiny concurrency gate ───────────────────────────────────────────────
let active = 0
const queue = []
function acquire() {
  if (active < MAX_CONCURRENCY) {
    active++
    return Promise.resolve()
  }
  return new Promise((resolve) => queue.push(resolve))
}
function release() {
  active--
  const next = queue.shift()
  if (next) {
    active++
    next()
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function postOnce({ key, body }) {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': 'Nova Translate Eval',
    },
    body: JSON.stringify(body),
  })
}

export async function openrouterComplete({ model, system, text, temperature = 0, maxTokens = 700 }) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not set.')

  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: text })
  const body = { model, messages, temperature, max_tokens: maxTokens }

  await acquire()
  const started = Date.now()
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await postOnce({ key, body })

      // Rate limited / transient → back off and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * 2 ** attempt // 1s, 2s, 4s
        await sleep(waitMs)
        continue
      }

      if (!res.ok) {
        let detail = ''
        try {
          const j = await res.json()
          detail = j?.error?.message || JSON.stringify(j)
        } catch {
          detail = await res.text().catch(() => '')
        }
        throw new Error(`OpenRouter ${res.status}: ${detail || res.statusText}`)
      }

      const data = await res.json()
      const reply = data?.choices?.[0]?.message?.content ?? ''
      return { text: reply.trim(), ms: Date.now() - started, modelId: model }
    }
    throw new Error(`OpenRouter: still rate-limited after ${MAX_RETRIES} retries.`)
  } finally {
    release()
  }
}
