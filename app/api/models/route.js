import { NextResponse } from 'next/server'
import { MODELS, defaultBaseId, judgeBaseId, geoPrefix } from '@/lib/models'

const REGION = process.env.AWS_REGION || 'us-west-1'

// Exposes the model registry + which baseId is the env default, so the client
// doesn't have to know about region/CRIS resolution.
export async function GET() {
  return NextResponse.json({
    region: REGION,
    geo: geoPrefix(REGION),
    defaultModel: defaultBaseId(),
    judgeModel: judgeBaseId(),
    models: MODELS,
  })
}
