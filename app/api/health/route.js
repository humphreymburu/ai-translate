import { NextResponse } from 'next/server'
import { defaultBaseId, providerOf, resolveModelId } from '@/lib/models'

const REGION = process.env.AWS_REGION || 'us-west-1'

export async function GET() {
  const baseId = defaultBaseId()
  const modelId = resolveModelId(baseId, REGION)

  return NextResponse.json({
    ok: true,
    baseId,
    model: modelId,
    provider: providerOf(baseId),
    region: REGION,
    // Which provider credentials the server can see — handy when one lapses.
    credentials: {
      bedrock: Boolean(
        process.env.AWS_BEARER_TOKEN_BEDROCK ||
          process.env.AWS_ACCESS_KEY_ID ||
          process.env.AWS_PROFILE,
      ),
      qwen: Boolean(process.env.QWEN_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    },
  })
}
