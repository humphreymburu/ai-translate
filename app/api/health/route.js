import { NextResponse } from 'next/server'

const REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID = process.env.NOVA_MODEL_ID || 'us.amazon.nova-2-lite-v1:0'

export async function GET() {
  return NextResponse.json({ ok: true, model: MODEL_ID, region: REGION })
}
