// Provider dispatch shared by the interactive translator and the eval harness.
// Keeps the route handlers free of "which vendor is this model id?" logic.

import { byBaseId, resolveModelId } from '@/lib/models'
import { converseOnce, converseStream, describeError } from '@/lib/bedrock'
import { qwenComplete, qwenStream, describeQwenError } from '@/lib/qwen'

const isQwen = (baseId) => byBaseId(baseId)?.provider === 'qwen'

// One-shot translation → { text, ms, modelId }. Throws on provider errors.
export function translateOnce({ baseId, system, text }) {
  if (isQwen(baseId)) return qwenComplete({ model: resolveModelId(baseId), system, text })
  return converseOnce({ baseId, system, text })
}

// Streaming translation → { modelId, chunks() }.
export function translateStream({ baseId, system, text }) {
  if (isQwen(baseId)) return qwenStream({ model: resolveModelId(baseId), system, text })
  return converseStream({ baseId, system, text })
}

// Map a provider-native error to an actionable message.
export function describeProviderError(err, baseId) {
  const modelId = resolveModelId(baseId)
  return isQwen(baseId) ? describeQwenError(err, modelId) : describeError(err, modelId)
}
