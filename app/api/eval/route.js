import { NextResponse } from 'next/server'
import { buildSystemPrompt, languageName } from '@/lib/prompt'
import { chrf } from '@/lib/chrf'
import { judgeTranslation } from '@/lib/judge'
import { isKnownModel, judgeBaseId, providerOf, resolveModelId, byBaseId } from '@/lib/models'
import { describeProviderError, translateOnce } from '@/lib/providers'

export const runtime = 'nodejs'
export const maxDuration = 300

// Evaluate one test item across several candidate models. For each model:
//   1. translate with the shared production prompt (temperature 0)
//   2. chrF vs the human reference (if provided)
//   3. LLM-as-judge rubric score
// Models run concurrently; a single model's failure is captured, not fatal.
export async function POST(request) {
  const body = await request.json()
  const { item, models, judge } = body || {}

  if (!item?.sourceText?.trim()) {
    return NextResponse.json({ error: 'Test item has no source text.' }, { status: 400 })
  }
  if (!item.target) {
    return NextResponse.json({ error: 'Test item has no target language.' }, { status: 400 })
  }
  const candidates = (models || []).filter(isKnownModel)
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No known models selected.' }, { status: 400 })
  }

  const judgeModel = judge && isKnownModel(judge) ? judge : judgeBaseId()
  const sourceName = languageName(item.source || 'en')
  const targetName = languageName(item.target)
  const systemPrompt = buildSystemPrompt(item.source || 'en', item.target)

  const results = await Promise.all(
    candidates.map(async (baseId) => {
      const meta = byBaseId(baseId)
      const base = {
        baseId,
        label: meta?.label || baseId,
        provider: providerOf(baseId),
        modelId: resolveModelId(baseId),
      }

      let translation
      try {
        translation = await translateOnce({
          baseId,
          system: systemPrompt,
          text: item.sourceText,
        })
      } catch (err) {
        return { ...base, error: describeProviderError(err, baseId) }
      }

      const chrfScore = item.reference ? chrf(item.reference, translation.text) : null

      const judgeResult = await judgeTranslation({
        judgeBaseId: judgeModel,
        sourceName,
        targetName,
        sourceText: item.sourceText,
        reference: item.reference,
        candidate: translation.text,
      })

      return {
        ...base,
        translation: translation.text,
        ms: translation.ms,
        chrf: chrfScore,
        judge: judgeResult,
      }
    }),
  )

  return NextResponse.json({
    itemId: item.id,
    target: item.target,
    judgeModel,
    hasReference: Boolean(item.reference),
    results,
  })
}
