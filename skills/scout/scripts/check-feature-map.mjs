#!/usr/bin/env node
// Checks a verify-<app> feature map against the pstack shape in ../references/feature-map-example/.
// Usage: node check-feature-map.mjs <skill-dir>/features      exit 0 = shape ok, 1 = problems listed
// No deps. Checks structure only; whether the recipes are true is the live pass's job.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const dir = process.argv[2]
if (!dir || !existsSync(join(dir, 'README.md'))) {
  console.error('usage: check-feature-map.mjs <features-dir>   (it must contain README.md)')
  process.exit(2)
}

const README_H2 = ['Baseline preconditions', 'Driving conventions', 'Proof and skip reporting', 'Feature entry contract', 'Features']
const FEATURE_H2 = [/^Sub-features$/, /^How to get to it \(user POV\)$/, /^Driving it with .+$/, /^Gotchas$/]
// Source paths are implementation details; the map names user paths, handles, commands and proof only.
const SOURCE_PATH = /\b[\w./-]+\.(tsx?|jsx?|go|dart|py|rb|java|kt|swift|vue|svelte|css|scss)\b/

const problems = []
const bad = (file, msg) => problems.push(`${file}: ${msg}`)
const h2s = (text) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
const section = (text, name) => {
  const start = text.search(new RegExp(`^## ${name.replace(/[()]/g, '\\$&')}`, 'm'))
  if (start < 0) return ''
  const rest = text.slice(start).split('\n').slice(1).join('\n')
  const end = rest.search(/^## /m)
  return end < 0 ? rest : rest.slice(0, end)
}

const readme = readFileSync(join(dir, 'README.md'), 'utf8')
const got = h2s(readme)
if (got.join('|') !== README_H2.join('|')) bad('README.md', `H2s must be, in order: ${README_H2.join(', ')}; got: ${got.join(', ')}`)

const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
const linked = new Set([...section(readme, 'Features').matchAll(/\]\(\.?\/?([^)#]+\.md)\)/g)].map((m) => basename(m[1])))
for (const f of files) if (!linked.has(f)) bad('README.md', `Features does not link ${f}`)
for (const f of linked) if (!files.includes(f)) bad('README.md', `Features links missing file ${f}`)

for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8')
  const lines = text.split('\n')
  if (!/^# \S/.test(lines[0] || '')) bad(f, 'first line must be the H1 title')
  const intro = lines.slice(1).find((l) => l.trim())
  if (!intro || intro.startsWith('#')) bad(f, 'H1 must be followed by a paragraph describing the user-visible behaviour')

  const heads = h2s(text)
  if (heads.length !== 4 || !FEATURE_H2.every((re, i) => re.test(heads[i] || ''))) {
    bad(f, `H2s must be exactly: Sub-features, How to get to it (user POV), Driving it with <harness>, Gotchas; got: ${heads.join(', ')}`)
    continue
  }

  const ids = [...section(text, 'Sub-features').matchAll(/^- `([a-z0-9-]+)` \S/gm)].map((m) => m[1])
  if (ids.length === 0) bad(f, 'Sub-features must list short IDs as "- `id` one line"')

  if (!section(text, 'How to get to it (user POV)').match(/^- /m)) bad(f, 'How to get to it lists no entry point')

  const drive = section(text, heads[2])
  if (!/^\s*Preconditions:\s*$/m.test(drive.split('\n').find((l) => l.trim()) || '')) bad(f, 'Driving section must start with "Preconditions:"')
  const steps = [...drive.matchAll(/^- \*\*([^*]+)\*\*/gm)].map((m) => m[1].trim())
  if (steps.length === 0) bad(f, 'Driving section has no labeled "- **Action.**" bullets')
  else if (!/^Proof\.?$/.test(steps.at(-1))) bad(f, 'last Driving bullet must be "- **Proof.**"')
  if (steps.length && steps.length < ids.length) bad(f, `${ids.length} sub-features but only ${steps.length} driving bullets; every sub-feature needs a step`)

  lines.forEach((l, i) => {
    const m = l.match(SOURCE_PATH)
    if (m) bad(`${f}:${i + 1}`, `source path "${m[0]}" is an implementation detail; keep it in SKILL.md Helpers`)
  })
}

if (problems.length) {
  console.log(problems.join('\n'))
  console.log(`\n${problems.length} problem(s); shape reference: scout/references/feature-map-example/`)
  process.exit(1)
}
console.log(`feature map ok: README + ${files.length} feature file(s)`)
