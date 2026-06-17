// Thin wrapper around the Bedrock Converse API shared by the translate route
// (streaming) and the eval harness (one-shot).

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { resolveModelId } from '@/lib/models'

const REGION = process.env.AWS_REGION || 'us-east-1'

let _client
export function getClient() {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: REGION,
      requestHandler: { requestTimeout: 120_000 },
    })
  }
  return _client
}

// Translate `inference` is intentionally deterministic for reproducible evals.
const INFERENCE = { maxTokens: 4096, temperature: 0, topP: 0.9 }

// Map a Bedrock SDK error to a friendly message + the resolved id involved.
export function describeError(err, modelId) {
  if (err?.name === 'AccessDeniedException')
    return `Access denied for "${modelId}". Enable it in the Bedrock console and confirm the region (${REGION}).`
  if (err?.name === 'ValidationException')
    return `Invalid model id "${modelId}" for region ${REGION}. Check the CRIS prefix (us./eu./apac.).`
  if (err?.name === 'ResourceNotFoundException')
    return `Model "${modelId}" not found in ${REGION}.`
  return err?.message || 'Bedrock request failed.'
}

// One-shot translation. Returns { text, ms, modelId }. Throws on Bedrock errors
// (callers in the eval harness catch per-model so one failure doesn't sink the
// whole run).
export async function converseOnce({ baseId, system, text, inference }) {
  const modelId = resolveModelId(baseId)
  if (!modelId) throw new Error(`Unknown model: ${baseId}`)

  const started = Date.now()
  const out = await getClient().send(
    new ConverseCommand({
      modelId,
      system: system ? [{ text: system }] : undefined,
      messages: [{ role: 'user', content: [{ text }] }],
      inferenceConfig: { ...INFERENCE, ...inference },
    }),
  )
  const reply =
    out?.output?.message?.content?.map((b) => b.text || '').join('') ?? ''
  return { text: reply.trim(), ms: Date.now() - started, modelId }
}

// Streaming translation. Returns an async iterable of text chunks.
export async function converseStream({ baseId, system, text }) {
  const modelId = resolveModelId(baseId)
  if (!modelId) throw new Error(`Unknown model: ${baseId}`)

  const response = await getClient().send(
    new ConverseStreamCommand({
      modelId,
      system: system ? [{ text: system }] : undefined,
      messages: [{ role: 'user', content: [{ text }] }],
      inferenceConfig: INFERENCE,
    }),
  )

  return {
    modelId,
    async *chunks() {
      for await (const event of response.stream) {
        const chunk = event.contentBlockDelta?.delta?.text
        if (chunk) yield chunk
      }
    },
  }
}
