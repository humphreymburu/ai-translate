# Translation → Judge → Leaderboard flow

ASCII flow of both paths: the interactive translator and the `/eval` harness.
File/function references point at the real implementation.

## A. Interactive translate (single model, streaming)

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER  ·  app/page.jsx ( / )                                          │
│  • from=en  • to=ru  • model=<baseId>  • paste source text            │
│  • ⌘/Ctrl+Enter ──────────────────────────────────────────────┐      │
└────────────────────────────────────────────────────────────────┼─────┘
                                                                   │
                         POST /api/translate                       │
                         { text, source, target, model }           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  app/api/translate/route.js                                            │
│  1. validate target lang + non-empty text                              │
│  2. baseId = isKnownModel(model) ? model : defaultBaseId()  (models.js)│
│  3. systemPrompt = buildSystemPrompt(source, target)        (prompt.js)│
│  4. converseStream({ baseId, system, text })               (bedrock.js)│
└───────────────────────────────┬────────────────────────────────────────┘
                                 │ resolveModelId(baseId)  → eu.<baseId>
                                 ▼
                    ┌───────────────────────────┐
                    │  AWS Bedrock Converse      │
                    │  ConverseStreamCommand     │
                    │  temp=0, topP=0.9          │
                    └─────────────┬─────────────┘
                                  │ text deltas
                                  ▼
                    ReadableStream ── chunks ──▶ browser appends to output pane
                                                 (live, char-by-char)
```

## B. Eval harness (many models → scored → ranked)

```
┌────────────────────────────────────────────────────────────────────────┐
│  USER  ·  app/eval/page.jsx ( /eval )                                    │
│                                                                          │
│  GET /api/testset ─▶ test cases     GET /api/models ─▶ registry + judge  │
│  (eval/testset/*.json)              (lib/models.js)                      │
│                                                                          │
│  ☑ pick test cases        ☑ pick candidate models        [ Run eval ]    │
└───────────────────────────────────┬──────────────────────────────────────┘
                                     │  for each picked test case (sequential):
                                     │  POST /api/eval { item, models:[baseId…] }
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  app/api/eval/route.js                                                     │
│  systemPrompt = buildSystemPrompt(item.source, item.target)                │
│  judgeModel   = JUDGE_MODEL_ID  (default google/gemma-4-31b-it:free)        │
│                                                                            │
│  Promise.all( candidates.map( runOneModel ) )  ◀── models run CONCURRENTLY │
└───────────────────────────────────┬────────────────────────────────────────┘
                                     │
            ┌────────────────────────┴────────────────────────┐
            ▼                        ▼                          ▼
   ┌───────────────┐       ┌───────────────┐         ┌───────────────┐
   │  model: Lite  │       │  model: Pro   │   …     │  model: Claude│
   └───────┬───────┘       └───────┬───────┘         └───────┬───────┘
           ▼                       ▼                         ▼
   ╔═══════════════════════════════════════════════════════════════════╗
   ║  runOneModel(baseId)        (one per candidate)                     ║
   ║                                                                     ║
   ║  STEP 1 · TRANSLATE                                                  ║
   ║    converseOnce({ baseId, system, text:item.sourceText })           ║
   ║    └─▶ Bedrock ConverseCommand (temp 0) ─▶ { translation, ms }      ║
   ║          │                                                          ║
   ║          ├── on error (AccessDenied / Validation / …)               ║
   ║          │      └─▶ return { baseId, error } ──┐ (model skipped,    ║
   ║          │                                      │  others continue) ║
   ║          ▼                                      │                   ║
   ║  STEP 2 · chrF   (lib/chrf.js)                  │                   ║
   ║    reference? chrf(item.reference, translation) │  deterministic    ║
   ║             : null                              │  0–100 lexical    ║
   ║          │                                      │                   ║
   ║          ▼                                      │                   ║
   ║  STEP 3 · LLM JUDGE   (lib/judge.js)            │                   ║
   ║    judgeTranslation({ judgeModel, sourceText,   │                   ║
   ║       reference, candidate:translation })       │                   ║
   ║      └─▶ build rubric prompt (source [+ref] +   │                   ║
   ║          candidate)                             │                   ║
   ║      └─▶ judgeComplete(judgeModel) ─▶ dispatch  │                   ║
   ║            by id shape (see §C)                  │                   ║
   ║      └─▶ extractJson() → 1–5 per criterion:     │                   ║
   ║            accuracy · fluency · terminology ·   │                   ║
   ║            faithfulness  + errors[] + summary   │                   ║
   ║      └─▶ overall = mean(1..5) mapped → 0–100     │                   ║
   ║          │                                      │                   ║
   ║          ▼                                      │                   ║
   ║  return { baseId, label, translation, ms,       │                   ║
   ║           chrf, judge:{scores,overall,errors} } │                   ║
   ╚═══════════════════════════════════╪═════════════╪═══════════════════╝
                                        │             │
                                        ▼             ▼
                       results: [ { per-model … }, { error … }, … ]
                                        │
                       JSON ◀───────────┘  (one response per test case)
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  app/eval/page.jsx  ·  aggregate + render                                  │
│                                                                            │
│  LEADERBOARD  (sorted by Score = Judge × coverage; see §D)                 │
│  ┌────┬──────────────┬───────┬──────────────┬──────┬──────┬──────┐         │
│  │ #  │ Model        │ Score │ Judge (n/tot)│ chrF │ fail │ skip │         │
│  ├────┼──────────────┼───────┼──────────────┼──────┼──────┼──────┤         │
│  │ 1  │ Nova Pro     │ 88.5  │ 88.5 · 10/10 │ 77.3 │  —   │  —   │         │
│  │ 2  │ Claude Son.4 │ 65.9  │ 94.2 · 7/10  │ 71.8 │  3   │  —   │ ◀ bailed│
│  │ 3  │ Nova 2 Lite  │ 62.0  │ 62.0 · 10/10 │ 75.9 │  —   │  2   │         │
│  └────┴──────────────┴───────┴──────────────┴──────┴──────┴──────┘         │
│   fail = candidate_fail (model's fault) · skip = judge_skip (harness fault) │
│                                                                            │
│  PER-CASE DETAIL  (per model)                                              │
│   accuracy 5/5 · fluency 4/5 · terminology 5/5 · faithfulness 3/5          │
│   summary: "…"        errors: ["left 'meanwhile' untranslated", …]         │
│   [ show translation ]                                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

## C. Judge provider routing (lib/judge.js → judgeComplete)

The judge can run on a different provider/family from the candidates. The id
shape decides where the rubric prompt is sent — no extra config flag:

```
                 judgeComplete(judgeModelId, prompt)
                              │
              isOpenRouterId(id)?  ("vendor/model" → has "/")
            ┌─────────────────┴───────────────────┐
           yes                                    no
            ▼                                      ▼
  ┌──────────────────────────────┐    ┌──────────────────────────────┐
  │ lib/openrouter.js            │    │ lib/bedrock.js               │
  │ openrouterComplete()         │    │ converseOnce()               │
  │  • OpenAI-compatible POST    │    │  • ConverseCommand           │
  │    /api/v1/chat/completions  │    │  • resolveModelId(baseId)    │
  │  • Bearer OPENROUTER_API_KEY │    │    → eu.<baseId>             │
  │  • concurrency gate (1)      │    │                              │
  │  • 429/5xx retry + backoff   │    │                              │
  └──────────────┬───────────────┘    └──────────────┬───────────────┘
                 ▼                                    ▼
   e.g. google/gemma-4-31b-it:free      e.g. eu.anthropic.claude-sonnet-4…
        (OpenRouter, free, throttled)        or eu.amazon.nova-pro-v1:0
```

Note: candidates (the translations) always run on Bedrock; only the **judge**
may route to OpenRouter. The concurrency gate serializes judge calls (default 1)
so the parallel candidate fan-out doesn't trip OpenRouter free-tier limits —
tune with `OPENROUTER_MAX_CONCURRENCY`.

## D. Timing model (why the fan-out doesn't buy what it looks like)

`Promise.all` over candidates parallelizes the **translates** (concurrent on
Bedrock) but NOT the expensive part: every judge call must acquire the OpenRouter
gate (`OPENROUTER_MAX_CONCURRENCY`, default 1), so the judges **re-serialize**
behind it and become the bottleneck.

```
per_case ≈ max_i(t_translate_i)  +  ⌈N / G⌉ · (t_judge + r)
                  ▲                          ▲          ▲
          parallel on Bedrock      serialized by gate   429/5xx
          (≈ slowest candidate)    (G=1 ⇒ N in a row)   retry+backoff

total ≈ T · per_case          (outer loop over T cases is sequential)
```

With illustrative numbers (max translate ≈ 3.1s, t_judge ≈ 5s, r ≈ 0.6s,
T = 10), the **shape** is the point — OpenRouter judge (gate=1) grows linearly
in N; a Bedrock judge (no gate, judges run concurrent with translates,
per_case ≈ max_i(t_translate_i + t_judge_i)) stays ~flat until Bedrock's own
concurrency ceiling:

```
   N    OR judge (gate=1)/case   OR total(10)   Bedrock judge/case   BR total(10)
   3        ~19.9s                ~3.3 min          ~8.1s              ~1.4 min
   5        ~31.1s                ~5.2 min          ~8.1s              ~1.4 min
   8        ~47.9s                ~8.0 min          ~8.1s              ~1.4 min
   12       ~70.3s               ~11.7 min          ~8.1s              ~1.4 min
```

Two consequences:
- Raising **G** is not a monotonic win on the free tier: `⌈N/G⌉` shrinks but `r`
  grows as you trip rate limits → there's a sweet spot.
- The **sequential outer loop is load-bearing** — it's the only thing bounding
  total gate pressure. Parallelizing cases looks like an easy `Promise.all` win
  and isn't (it multiplies judge-gate contention). Marked with a comment in
  `app/eval/page.jsx`.

The candidate fan-out only pays off when the judge isn't gated (Bedrock judge,
or a paid OpenRouter key with higher G).

## E. Ranking key (fails-aware)

Sorting by mean judge over *successful* cases rewards a model that bails on the
hard ones. The fix needs the `extractJson` distinction — three outcomes per
(case, model):

```
classify(r):
  r.error            → candidate_fail   (no valid translation — MODEL's fault)
  r.judge.overall==∅ → judge_skip       (translation fine, judge unparseable —
                                          HARNESS fault; must NOT penalize model)
  else               → scored

meanJudge = mean(overall) over scored cases
coverage  = produced / totalCases        (judge_skips count as produced)
Score     = meanJudge × coverage         ← primary sort key
tiebreak  = coverage → latency           (deliberately NOT chrF)
```

`Score = Judge × coverage`: a model judged 94 that only produced 7/10 ranks
~65.9, behind a steady 88-over-10/10. Alternatives considered: zero-fill (count
candidate_fails as 0) is harsher and lets one transient AccessDenied tank a
model; a lower-confidence-bound is the most defensible given the weak/noisy
judge but lwest legible. Coverage-weighting is the readable middle.

chrF is **not** the tiebreak: using the metric we trust less to adjudicate the
one we trust more would promote the more literal/reference-hugging output, and
it's unavailable for reference-free cases. The leaderboard always renders the
denominator (`88.5 · 7/10`) so the discount is visible; a rising judge_skip
count is the signal to harden `extractJson` before trusting the numbers.

## Scoring at a glance

```
              ┌─────────────────────── reference-based ──────────────────────┐
 SOURCE  ───▶ │  chrF      = char n-gram overlap(reference, candidate) 0–100  │
   │          └──────────────────────────────────────────────────────────────┘
   │          ┌──────────────────── source (+ reference) based ───────────────┐
   └────────▶ │  LLM JUDGE = strong model grades candidate on 1–5 rubric:      │
              │     accuracy · fluency · terminology · faithfulness            │
              │     overall = mean → 0–100   (PRIMARY "near-human" signal)     │
              └──────────────────────────────────────────────────────────────┘

 Bias note: judge family ≠ candidate family (set JUDGE_MODEL_ID) → fairer rank.
   • google/gemma-4-31b-it:free — different family, free, but a WEAKER judge
   • eu.anthropic.claude-sonnet-4… — strongest judge (needs Bedrock access)
   • eu.amazon.nova-pro-v1:0 — same family as candidates → lenient/biased
 Ranking sorts on Score = Judge × coverage (§E); chrF is shown but NOT a
 tiebreak. chrF stays a sanity signal: high chrF + low judge = literal hugging;
 low chrF + high judge = good paraphrase the reference didn't anticipate.
```
