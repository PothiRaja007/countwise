// P12 guard — this step adds tests only. Every file under src/ must be byte-for-byte what it was when P11 was locked.
// (Line endings are ignored so a Windows checkout compares equal.) If a LATER phase changes product code on purpose,
// regenerate e2e/support/p11-src-manifest.json in that phase and say so in its report.
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, 'e2e/support/p11-src-manifest.json'), 'utf8'))

function hashTree(dir, out = {}) {
  for (const name of readdirSync(path.join(root, dir)).sort()) {
    const rel = `${dir}/${name}`
    if (statSync(path.join(root, rel)).isDirectory()) hashTree(rel, out)
    else out[rel] = createHash('sha256').update(readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)
  }
  return out
}

test('P12 changed no product code: src/ equals the P11 lock', async ({}, info) => {
  test.skip(info.project.name !== 'desktop-light', 'one project is enough')
  const now = hashTree('src')
  const changed = Object.keys({ ...manifest, ...now }).filter((k) => manifest[k] !== now[k])
  expect(changed, 'files under src/ that differ from the P11 lock').toEqual([])
  expect(Object.keys(now)).toHaveLength(Object.keys(manifest).length)
})
