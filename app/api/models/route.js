import { NextResponse } from 'next/server'
import { MODELS, defaultBaseId, judgeBaseId, geoPrefix, resolveModelId } from '@/lib/models'

const REGION = process.env.AWS_REGION || 'us-west-1'

// Exposes the model registry + which baseId is the env default, so the client
// doesn't have to know about region/CRIS resolution or which provider serves it.
export async function GET() {
  return NextResponse.json({
    region: REGION,
    geo: geoPrefix(REGION),
    defaultModel: defaultBaseId(),
    judgeModel: judgeBaseId(),
    // Resolve each entry up front so the client can show what will actually be
    // invoked (e.g. eu.amazon.nova-pro-v1:0 vs qwen-plus).
    models: MODELS.map((m) => ({ ...m, modelId: resolveModelId(m.baseId) })),
  })
}
