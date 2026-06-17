import { NextResponse } from 'next/server'
import { defaultBaseId, resolveModelId } from '@/lib/models'

const REGION = process.env.AWS_REGION || 'us-west-1'

export async function GET() {
  const baseId = defaultBaseId()
  const modelId = resolveModelId(baseId, REGION)

  return NextResponse.json({ ok: true, baseId, model: modelId, region: REGION })
}
