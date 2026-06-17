// Registry of translation models available through the Bedrock Converse API.
//
// `baseId` is the bare Bedrock model id. Most modern models are only reachable
// through a cross-region inference (CRIS) profile, which prefixes the id with a
// geo (us./eu./apac.) that must match AWS_REGION — see resolveModelId(). Set
// `cris: false` for a model you invoke by its bare id.
//
// This file is PURE DATA + pure helpers so it can be imported from both client
// and server. resolveModelId() reads process.env only when called server-side.

export const MODELS = [
  {
    baseId: 'amazon.nova-lite-v1:0',
    label: 'Nova Lite',
    family: 'Amazon Nova',
    tier: 'fast',
    note: 'Cheapest/fastest. Weaker fidelity — leaves words untranslated, flips causality.',
  },
  {
    baseId: 'amazon.nova-pro-v1:0',
    label: 'Nova Pro',
    family: 'Amazon Nova',
    tier: 'balanced',
    note: 'Much more faithful than Lite. Good default for near-human output.',
  },
  {
    baseId: 'amazon.nova-premier-v1:0',
    label: 'Nova Premier',
    family: 'Amazon Nova',
    tier: 'quality',
    note: 'Most capable Nova. May not be available in every region.',
  },
  {
    baseId: 'amazon.nova-micro-v1:0',
    label: 'Nova Micro',
    family: 'Amazon Nova',
    tier: 'fast',
    note: 'Smallest Nova. Included as a low-end baseline for comparison.',
  },
  // Claude on Bedrock — different model family makes it a good, less-biased
  // judge than scoring Nova with Nova. Requires model access in your account/
  // region; if not enabled these will surface a clean AccessDenied in the UI.
  {
    baseId: 'anthropic.claude-sonnet-4-20250514-v1:0',
    label: 'Claude Sonnet 4',
    family: 'Anthropic Claude',
    tier: 'quality',
    note: 'Strong cross-family option. Requires Bedrock model access.',
  },
  {
    baseId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    label: 'Claude 3.5 Sonnet v2',
    family: 'Anthropic Claude',
    tier: 'balanced',
    note: 'Requires Bedrock model access.',
  },
]

// Env default for the interactive translator (set NOVA_MODEL_ID to a baseId, or
// to a full CRIS id — we strip the geo prefix to recover the baseId).
export function defaultBaseId() {
  const raw = process.env.NOVA_MODEL_ID || 'amazon.nova-lite-v1:0'
  return stripGeoPrefix(raw)
}

// The judge model used by the eval harness. Default to a different family from
// the candidates (Claude) to reduce self-preference bias; fall back to Nova Pro.
export function judgeBaseId() {
  return stripGeoPrefix(process.env.JUDGE_MODEL_ID || 'amazon.nova-pro-v1:0')
}

const GEO = ['us', 'eu', 'apac', 'global']

export function stripGeoPrefix(id) {
  const dot = id.indexOf('.')
  if (dot > 0 && GEO.includes(id.slice(0, dot))) return id.slice(dot + 1)
  return id
}

export function geoPrefix(region = process.env.AWS_REGION || 'us-west-1') {
  if (region.startsWith('eu-')) return 'eu'
  if (region.startsWith('ap-')) return 'apac'
  return 'us'
}

// Resolve a registry baseId to the concrete modelId for the current region.
export function resolveModelId(baseId, region = process.env.AWS_REGION) {
  const model = MODELS.find((m) => m.baseId === baseId)
  if (!model) return null
  if (model.cris === false) return baseId
  return `${geoPrefix(region)}.${baseId}`
}

export const isKnownModel = (baseId) => MODELS.some((m) => m.baseId === baseId)

export const byBaseId = (baseId) => MODELS.find((m) => m.baseId === baseId)
