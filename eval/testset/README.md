# Eval test set

Each `*.json` file here is one translation test case, loaded by `/api/testset`
and shown on the **/eval** page.

## Format

```json
{
  "id": "unique-slug",
  "title": "Human-readable name shown in the UI",
  "source": "en",
  "target": "ru",
  "sourceText": "The full source text to translate…",
  "reference": "The expert human translation (optional)…"
}
```

- `source` / `target` are language codes from [`lib/languages.js`](../../lib/languages.js).
- `reference` is **optional**. With it, the harness reports chrF and the LLM
  judge scores closeness to the human rendering. Without it, the judge scores
  the candidate against the source only (reference-free).

## Adding cases

Drop in more `.json` files (one per source/target pair). 5–20 varied cases
(news, technical, marketing, dialogue) give a far more meaningful leaderboard
than a single article. No restart needed in dev — the route reads the folder on
each request.

## How scores are computed

- **chrF (0–100)** — deterministic character n-gram overlap with the reference.
  A cheap sanity signal; high values track the reference's wording.
- **Judge (0–100)** — a strong model (`JUDGE_MODEL_ID`, default Nova Pro) grades
  accuracy / fluency / terminology / faithfulness on a 1–5 rubric. This is the
  primary "near-human" signal. Use a *different* model family for the judge
  (e.g. a Claude model) to avoid self-preference bias when ranking Nova models.
