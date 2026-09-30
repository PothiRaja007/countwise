"""
G1 — first model training run (TF-IDF + Logistic Regression).

Offline only. Trains on the 'train' split, picks a confidence threshold on
'val_structural' (never touched for training itself), reports final numbers
on the two locked test splits exactly once. Exports:
  - model.json: everything a plain-JS scorer needs to reproduce this model
  - predictions_reference.json: this Python model's own predictions on every
    non-train example, used ONLY to verify the JS reproduction is faithful —
    the JS test never re-derives correctness from scratch, it diffs against
    this file.
"""
import json, re, sys
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support, confusion_matrix

corpus = json.load(open('/tmp/g1_corpus.json'))
examples = corpus['examples']

# ---- Preprocessing: MUST be byte-identical to the JS reproduction. -------
# lowercase -> every digit run becomes the literal token "amtnum" (so the
# amount VALUE can never become a spurious category signal, per design v2
# Section 31's "no superficial correlations" principle — the model should
# never learn "coffee near cheap amounts = Food") -> strip everything but
# letters and spaces -> collapse whitespace.
def preprocess(text):
    t = text.lower()
    t = re.sub(r'\d+', ' amtnum ', t)
    t = re.sub(r'[^a-z\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

by_split = {}
for e in examples:
    by_split.setdefault(e['split'], []).append(e)

train = by_split['train']
val = by_split['val_structural']
test_lex = by_split['test_lexical']
test_comp = by_split['test_compositional']

print(f"train={len(train)} val_structural={len(val)} test_lexical={len(test_lex)} test_compositional={len(test_comp)}")

X_train_text = [preprocess(e['text']) for e in train]
y_train = [e['category'] for e in train]

vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, token_pattern=r"(?u)\b\w\w+\b")
X_train = vectorizer.fit_transform(X_train_text)
print(f"vocabulary size: {len(vectorizer.vocabulary_)}")

clf = LogisticRegression(max_iter=3000, class_weight='balanced', solver='lbfgs')
clf.fit(X_train, y_train)
print(f"classes: {list(clf.classes_)}")

def transform_eval(split_examples):
    texts = [preprocess(e['text']) for e in split_examples]
    X = vectorizer.transform(texts)
    proba = clf.predict_proba(X)
    pred_idx = proba.argmax(axis=1)
    pred = clf.classes_[pred_idx]
    conf = proba.max(axis=1)
    return pred, conf, proba

pred_val, conf_val, _ = transform_eval(val)
y_val = np.array([e['category'] for e in val])

# ---- Threshold selection on VAL ONLY (never on test) ----------------------
best = None
for thresh in np.arange(0.20, 0.95, 0.05):
    accepted = conf_val >= thresh
    coverage = accepted.mean()
    if accepted.sum() == 0:
        continue
    selective_acc = (pred_val[accepted] == y_val[accepted]).mean()
    # Simple, stated rule: maximize selective accuracy subject to coverage >= 0.5;
    # if nothing clears 50% coverage, fall back to whatever has the most coverage.
    score = (selective_acc, coverage) if coverage >= 0.5 else (-1, coverage)
    if best is None or score > best[0]:
        best = (score, thresh, coverage, selective_acc)
_, CHOSEN_THRESHOLD, val_coverage, val_selective_acc = best
print(f"chosen confidence threshold (from val_structural only): {CHOSEN_THRESHOLD:.2f}  "
      f"(val coverage={val_coverage:.3f}, val selective accuracy={val_selective_acc:.3f})")

def evaluate(name, split_examples):
    pred, conf, proba = transform_eval(split_examples)
    y_true = np.array([e['category'] for e in split_examples])
    accepted = conf >= CHOSEN_THRESHOLD
    coverage = accepted.mean()
    overall_acc = accuracy_score(y_true, pred)  # if forced to always predict
    selective_acc = (pred[accepted] == y_true[accepted]).mean() if accepted.sum() > 0 else None
    macro_f1 = f1_score(y_true, pred, average='macro', zero_division=0)
    prec, rec, f1, support = precision_recall_fscore_support(y_true, pred, labels=clf.classes_, zero_division=0)
    print(f"\n--- {name} (n={len(split_examples)}) ---")
    print(f"  overall accuracy (if forced to predict every time): {overall_acc:.3f}")
    print(f"  coverage at threshold {CHOSEN_THRESHOLD:.2f}: {coverage:.3f}")
    print(f"  selective accuracy (accuracy AMONG accepted predictions): {selective_acc if selective_acc is None else f'{selective_acc:.3f}'}")
    print(f"  macro F1: {macro_f1:.3f}")
    per_cat = sorted(zip(clf.classes_, prec, rec, support), key=lambda x: -x[3])
    for cat, p, r, s in per_cat[:8]:
        print(f"    {cat:28s} support={int(s):3d}  precision={p:.2f}  recall={r:.2f}")
    return {'overall_accuracy': overall_acc, 'coverage': coverage, 'selective_accuracy': selective_acc, 'macro_f1': macro_f1,
            'per_category': [{'category': c, 'precision': float(p), 'recall': float(r), 'support': int(s)} for c, p, r, s in per_cat]}

results = {}
results['val_structural'] = evaluate('VAL — structural generalization (known words, new sentence structure)', val)
results['test_lexical'] = evaluate('TEST — lexical generalization (known structure, unseen words) [LOCKED, used once]', test_lex)
results['test_compositional'] = evaluate('TEST — compositional generalization (unseen structure + unseen words) [LOCKED, used once]', test_comp)

# ---- Export model.json: everything the JS scorer needs -------------------
vocab_items = sorted(vectorizer.vocabulary_.items(), key=lambda kv: kv[1])  # term -> feature index, in index order
terms = [t for t, _ in vocab_items]
idf = vectorizer.idf_.tolist()
model_export = {
    'modelVersion': 'g1-global-v1',
    'trainedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
    'preprocessing': {'description': 'lowercase; every digit run -> literal token amtnum; strip non a-z/space; collapse whitespace'},
    'ngramRange': [1, 2],
    'vocabulary': terms,       # index == position in this array
    'idf': idf,                # same order as vocabulary
    'classes': list(clf.classes_),
    'coef': clf.coef_.tolist(),        # [n_classes][n_features]
    'intercept': clf.intercept_.tolist(),
    'confidenceThreshold': float(CHOSEN_THRESHOLD),
}
json.dump(model_export, open('/tmp/g1_model.json', 'w'))
print(f"\nmodel.json: {len(terms)} vocabulary terms, {len(clf.classes_)} classes")

# ---- Export reference predictions for the JS faithfulness test -----------
reference = []
for split_name, split_examples in [('val_structural', val), ('test_lexical', test_lex), ('test_compositional', test_comp), ('train', train[:60])]:
    pred, conf, proba = transform_eval(split_examples)
    for e, p, c in zip(split_examples, pred, conf):
        reference.append({'id': e['id'], 'text': e['text'], 'trueCategory': e['category'],
                           'predictedCategory': str(p), 'confidence': float(c)})
json.dump(reference, open('/tmp/g1_predictions_reference.json', 'w'))
print(f"predictions_reference.json: {len(reference)} rows for JS cross-verification")

# ---- Stage 1/2 sanity: confirm these examples really are keyword-free ----
# (computed here in Python only as a sanity echo; the authoritative check
# already happened in generate.js using the REAL matchCategory().)
print("\n(Stage 1/2 — deterministic baseline — is computed against the real matchCategory() in JS, not here; expected ~0% by construction, since this corpus is Bucket A by definition.)")
