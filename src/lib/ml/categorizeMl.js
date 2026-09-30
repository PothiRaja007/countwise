// G1 — plain-JS inference for the global ML category model.
//
// This is a faithful reproduction of what train.py fits with scikit-learn
// (TfidfVectorizer(ngram_range=(1,2)) + LogisticRegression), not a
// re-derivation of the idea. Every step below was checked against sklearn's
// ACTUAL behavior empirically before being written (see comments), not
// assumed from documentation — sklearn's analyzer, for instance, forms
// bigrams from the FILTERED token sequence, not from consecutive words in
// the raw text, which is easy to get subtly wrong.
//
// categorizeMl.test.js is the load-bearing test here: it diffs this file's
// output against model/g1_predictions_reference.json — the Python model's
// OWN predictions on the same examples — row by row. A model that "looks
// right" in isolation but silently disagrees with the model it's supposed
// to reproduce is worse than no model at all, since nothing else would
// ever surface the mistake.
//
// No React, no Supabase, pure function in, prediction out.

import model from './model/g1_model.json' with { type: 'json' }

const VOCAB_INDEX = new Map(model.vocabulary.map((term, i) => [term, i]))

/**
 * MUST be byte-identical to train.py's preprocess(). Every digit run
 * becomes the literal token "amtnum" — the amount's actual VALUE must
 * never be a category signal (design v2 Section 31's anti-shortcut
 * principle, applied to a risk the design document didn't name but that
 * TF-IDF makes real: a numeral is just another token to a bag-of-words
 * model unless deliberately normalized away).
 */
function preprocess(text) {
  return text
    .toLowerCase()
    .replace(/\d+/g, ' amtnum ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// sklearn's default token_pattern is r"(?u)\b\w\w+\b": word-character runs
// of length 2+. A single-letter word ("a", "I") is silently dropped —
// verified empirically against a live TfidfVectorizer, not assumed.
function tokenize(preprocessed) {
  return preprocessed.match(/\w{2,}/g) || []
}

// Bigrams are formed from CONSECUTIVE ENTRIES OF THE FILTERED TOKEN LIST,
// not consecutive words in the original text — so "from a canteen" (with
// "a" dropped) bigrams as "from canteen", never "from a". This was the one
// detail most likely to be silently wrong if guessed instead of checked.
function ngrams(tokens) {
  const out = [...tokens]
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`)
  return out
}

function softmax(scores) {
  const max = Math.max(...scores)
  const exps = scores.map((s) => Math.exp(s - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

/**
 * @param {string} text
 * @returns {{ category: string|null, confidence: number, allProbabilities: Record<string, number> }}
 *   category is null when confidence falls below the trained threshold —
 *   abstention is a valid, intended outcome (design v2 Section 20), not a
 *   failure to report one.
 */
export function categorizeMl(text) {
  const tokens = ngrams(tokenize(preprocess(text)))

  // Raw term counts, restricted to the trained vocabulary — an unknown
  // word (this IS the point of held-out-vocabulary testing) simply
  // contributes nothing, exactly as sklearn's transform() does for an
  // out-of-vocabulary term at inference time.
  const counts = new Map()
  for (const t of tokens) {
    const idx = VOCAB_INDEX.get(t)
    if (idx === undefined) continue
    counts.set(idx, (counts.get(idx) || 0) + 1)
  }

  // TF-IDF: raw count * idf (sklearn's default: smooth_idf, sublinear_tf=False
  // — i.e. no log-scaling of the term frequency itself, exactly as
  // TfidfVectorizer's defaults, which train.py did not override).
  const tfidf = new Map()
  for (const [idx, count] of counts) tfidf.set(idx, count * model.idf[idx])

  // L2 normalize (TfidfVectorizer's default norm='l2', also not overridden).
  let normSq = 0
  for (const v of tfidf.values()) normSq += v * v
  const norm = Math.sqrt(normSq)
  if (norm > 0) for (const [idx, v] of tfidf) tfidf.set(idx, v / norm)

  // Linear scores per class: dot(features, coef_class) + intercept_class.
  const scores = model.classes.map((_, classIdx) => {
    let s = model.intercept[classIdx]
    for (const [idx, v] of tfidf) s += model.coef[classIdx][idx] * v
    return s
  })

  const probs = softmax(scores)
  let bestIdx = 0
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bestIdx]) bestIdx = i

  const allProbabilities = Object.fromEntries(model.classes.map((c, i) => [c, probs[i]]))
  const confidence = probs[bestIdx]
  return {
    category: confidence >= model.confidenceThreshold ? model.classes[bestIdx] : null,
    confidence,
    allProbabilities,
  }
}

export const ML_MODEL_VERSION = model.modelVersion
export const ML_CONFIDENCE_THRESHOLD = model.confidenceThreshold
