// LLM-as-judge scoring. A strong model grades a candidate translation against
// the source (and, when available, a human reference) on a fixed rubric and
// returns structured JSON. This is the primary "near-human" signal; chrF is the
// cheap cross-check.
//
// NOTE ON BIAS: judging Nova output with a Nova judge introduces a mild
// self-preference. Prefer a different family for JUDGE_MODEL_ID (e.g. a Claude
// model) when comparing models fairly.

import { converseOnce } from '@/lib/bedrock'
import { openrouterComplete, isOpenRouterId } from '@/lib/openrouter'

// Run the judge prompt on whichever provider the judge model id implies:
// an OpenRouter slug ("vendor/model") goes to OpenRouter; anything else is a
// Bedrock baseId handled by the Converse API.
function judgeComplete(judgeBaseId, prompt) {
  if (isOpenRouterId(judgeBaseId)) {
    return openrouterComplete({ model: judgeBaseId, text: prompt, temperature: 0, maxTokens: 700 })
  }
  return converseOnce({ baseId: judgeBaseId, text: prompt, inference: { temperature: 0, maxTokens: 700 } })
}

const CRITERIA = ['accuracy', 'fluency', 'terminology', 'faithfulness']

function buildJudgePrompt({ sourceName, targetName, sourceText, reference, candidate }) {
  const refBlock = reference
    ? `\n<human_reference>\n${reference}\n</human_reference>\n`
    : '\n(There is no human reference. Judge the candidate against the source only.)\n'

  return `You are a meticulous professional reviewer of ${sourceName}→${targetName}
translations. Score the CANDIDATE translation on a 1–5 integer scale for each
criterion (5 = indistinguishable from an expert human translation; 1 = unusable).

Criteria:
- accuracy: meaning is fully preserved; no additions, omissions, or hallucinated
  content; all numbers, dates, units and named entities are correct; the
  direction of causality/dependence is preserved.
- fluency: reads as natural, idiomatic, grammatical ${targetName} written by an
  educated native speaker; no calques or awkward word order.
- terminology: domain terms, institutions, and proper names use the correct,
  conventional ${targetName} renderings; consistent throughout.
- faithfulness: same register and structure as the source (no invented
  salutations/speech framing, headings/lists preserved); and crucially, NO
  ${sourceName} words left untranslated.

Penalize heavily: any untranslated ${sourceName} word, any reversed meaning,
any invented framing, and any wrong named entity (e.g. UNEP rendered as UNDP).

<source>
${sourceText}
</source>${refBlock}
<candidate>
${candidate}
</candidate>

Respond with ONLY a JSON object, no markdown, in exactly this shape:
{"accuracy":N,"fluency":N,"terminology":N,"faithfulness":N,"errors":["short specific issue", "..."],"summary":"one sentence"}`
}

function extractJson(raw) {
  if (!raw) return null
  let s = raw.trim()
  // strip ```json fences if present
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

// Returns { scores:{accuracy,fluency,terminology,faithfulness}, overall (0-100),
// errors:[], summary, ms, raw } — or { error } on judge failure.
export async function judgeTranslation({
  judgeBaseId,
  sourceName,
  targetName,
  sourceText,
  reference,
  candidate,
}) {
  const prompt = buildJudgePrompt({ sourceName, targetName, sourceText, reference, candidate })

  let res
  try {
    res = await judgeComplete(judgeBaseId, prompt)
  } catch (err) {
    return { error: err?.message || 'Judge call failed.' }
  }

  const parsed = extractJson(res.text)
  if (!parsed) return { error: 'Judge returned unparseable output.', raw: res.text }

  const scores = {}
  let sum = 0
  for (const c of CRITERIA) {
    const v = Number(parsed[c])
    scores[c] = Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : null
    sum += scores[c] || 0
  }
  // overall: mean of the four criteria, mapped 1..5 → 0..100
  const overall = Math.round(((sum / CRITERIA.length - 1) / 4) * 1000) / 10

  return {
    scores,
    overall,
    errors: Array.isArray(parsed.errors) ? parsed.errors.slice(0, 6) : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    ms: res.ms,
  }
}

export { CRITERIA }
