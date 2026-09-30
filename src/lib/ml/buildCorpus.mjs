// One-off script: runs the generator and writes the dataset + a summary.
// Not part of the app bundle — a build-time tool, same category as G0's
// evaluation-runner script.
import { writeFileSync } from 'node:fs'
import { generateCorpus, ABSTENTION_EXAMPLES } from './generate.js'
import { GLOBAL_CATEGORIES } from './categoryTruth.js'

const { examples, excludedByDeterministicRules, droppedDuplicates } = generateCorpus()

const bySplit = {}, byCategory = {}, byFamilyGroup = {}
for (const e of examples) {
  bySplit[e.split] = (bySplit[e.split] || 0) + 1
  byCategory[e.category] = (byCategory[e.category] || 0) + 1
  byFamilyGroup[e.familyGroup] = (byFamilyGroup[e.familyGroup] || 0) + 1
}
const coveredCategories = new Set(examples.map((e) => e.category))
const uncoveredCategories = GLOBAL_CATEGORIES.map((c) => c.name).filter((n) => !coveredCategories.has(n))

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    designDocument: 'G1 Design v2 (corrected)',
    scope: 'First slice — corpus generation infrastructure only. No model has been trained on this data.',
    totalExamples: examples.length,
    bySplit, byCategory, byFamilyGroup,
    uncoveredGlobalCategories: uncoveredCategories,
    excludedByDeterministicRulesCount: excludedByDeterministicRules.length,
    droppedDuplicatesCount: droppedDuplicates.length,
    abstentionExampleCount: ABSTENTION_EXAMPLES.length,
  },
  examples,
  abstentionExamples: ABSTENTION_EXAMPLES,
}

writeFileSync('/tmp/g1_corpus.json', JSON.stringify(output, null, 1))
console.log('meta:', JSON.stringify(output.meta, null, 1))
