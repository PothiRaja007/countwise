// Product-code guard. Every file under src/ must be byte-for-byte what it was when the last approved phase was locked.
// P12 locked src/ against p11-src-manifest.json (kept in this folder as the P11 record, unchanged). P14 changed product code
// on purpose, listed in the P14 report, and locked the result in p14-src-manifest.json, which this test now checks.
// (Line endings are ignored so a Windows checkout compares equal.) If a LATER phase changes product code on purpose,
// add a new manifest in that phase and say so in its report.
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, 'e2e/support/p14-src-manifest.json'), 'utf8'))

function hashTree(dir, out = {}) {
  for (const name of readdirSync(path.join(root, dir)).sort()) {
    const rel = `${dir}/${name}`
    if (statSync(path.join(root, rel)).isDirectory()) hashTree(rel, out)
    else out[rel] = createHash('sha256').update(readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)
  }
  return out
}

test('src/ equals the P14 lock (no product code changed since P14)', async ({}, info) => {
  test.skip(info.project.name !== 'desktop-light', 'one project is enough')
  const now = hashTree('src')
  const changed = Object.keys({ ...manifest, ...now }).filter((k) => manifest[k] !== now[k])
  expect(changed, 'files under src/ that differ from the P14 lock').toEqual([])
  expect(Object.keys(now)).toHaveLength(Object.keys(manifest).length)
})
