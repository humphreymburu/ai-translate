// chrF — character n-gram F-score (Popović, 2015). A cheap, deterministic,
// reference-based lexical metric. We use it as a sanity-check signal alongside
// the LLM judge: it rewards overlap with the human reference but, unlike BLEU,
// is robust for morphologically rich and space-free languages because it works
// on characters, not words. Score is 0–100 (higher = closer to the reference).
//
// Defaults match the common chrF2 setting: char n-grams of order 1..6, beta=2
// (recall weighted 2x precision).

const norm = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

function charNgrams(str, n) {
  const grams = new Map()
  for (let i = 0; i + n <= str.length; i++) {
    const g = str.slice(i, i + n)
    grams.set(g, (grams.get(g) || 0) + 1)
  }
  return grams
}

function fScore(ref, hyp, n, beta2) {
  const refG = charNgrams(ref, n)
  const hypG = charNgrams(hyp, n)
  const totalRef = [...refG.values()].reduce((a, b) => a + b, 0)
  const totalHyp = [...hypG.values()].reduce((a, b) => a + b, 0)
  if (totalRef === 0 || totalHyp === 0) return null

  let matches = 0
  for (const [g, c] of hypG) matches += Math.min(c, refG.get(g) || 0)

  const precision = matches / totalHyp
  const recall = matches / totalRef
  if (precision === 0 && recall === 0) return 0
  return ((1 + beta2) * precision * recall) / (beta2 * precision + recall)
}

export function chrf(reference, hypothesis, { maxOrder = 6, beta = 2 } = {}) {
  const ref = norm(reference)
  const hyp = norm(hypothesis)
  if (!ref || !hyp) return 0

  const beta2 = beta * beta
  const scores = []
  for (let n = 1; n <= maxOrder; n++) {
    const f = fScore(ref, hyp, n, beta2)
    if (f !== null) scores.push(f)
  }
  if (scores.length === 0) return 0
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  return Math.round(mean * 1000) / 10 // → 0..100, one decimal
}
