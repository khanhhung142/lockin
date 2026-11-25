#!/usr/bin/env node
// Doc health for a lockin project folder (see ../SKILL.md, "Keeping it true").
// Usage: node check-project-docs.mjs [project-dir]      (default: cwd)
// Fails (exit 1) on facts that are provably wrong: a referenced path that does not exist,
// a base branch or MR target that does not exist, a feature map off the pstack shape.
// Warns (exit 0) on signs of staleness: code moved on since the doc was last touched.
// No deps; reads git, never writes.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

const project = resolve(process.argv[2] || '.')
const fails = []
const warns = []
const git = (repo, ...args) => {
  try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null }
}
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()
const rel = (p) => p.replace(project + '/', '')

const repos = readdirSync(project).map((d) => join(project, d)).filter((d) => existsSync(join(d, '.git')))
if (!existsSync(join(project, 'AGENTS.md'))) fails.push('AGENTS.md: missing at project level (run /warmup)')

const agents = existsSync(join(project, 'AGENTS.md')) ? readFileSync(join(project, 'AGENTS.md'), 'utf8') : ''
const table = agents.split('\n').filter((l) => l.startsWith('|'))
const header = (table[0] || '').split('|').map((c) => c.trim())
const branchCols = header.map((h, i) => (/base branch|mr target/i.test(h) ? i : -1)).filter((i) => i >= 0)
const rowRepo = (row) => (row.split('|').map((c) => c.trim())[1] || '').match(/`([^`]+)`/)?.[1]
// A repo whose every branch cell is `none` is a read-only reference clone (an upstream copy): its docs are not ours to fix.
const reference = new Set(table.slice(2).filter((row) => {
  const cells = row.split('|').map((c) => c.trim())
  return branchCols.length && branchCols.every((col) => /^none\b/i.test(cells[col] || ''))
}).map(rowRepo).filter(Boolean))
const ours = repos.filter((r) => !reference.has(r.split('/').pop()))

// 1. Docs to scan for referenced paths.
const docs = [join(project, 'AGENTS.md'), join(project, 'GLOSSARY.md')]
for (const r of ours) docs.push(join(r, 'AGENTS.md'), join(r, 'design-rules.md'))
if (isDir(join(project, 'docs/adr'))) for (const f of readdirSync(join(project, 'docs/adr'))) docs.push(join(project, 'docs/adr', f))
const skills = join(project, '.agents/skills')
const verifySkills = isDir(skills) ? readdirSync(skills).filter((d) => d.startsWith('verify-')).map((d) => join(skills, d)) : []
for (const s of verifySkills) docs.push(join(s, 'SKILL.md'))

// A backticked token is a path claim when it has a slash, no spaces, no placeholders, and is not a URL, route or domain.
const PLACEHOLDER = /[<>*{}$|]/
function pathClaims(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()).filter((t) =>
    t.includes('/') && !/\s/.test(t) && !PLACEHOLDER.test(t) && !t.includes('://') &&
    !t.startsWith('/') && // routes such as /full/sops
    !/^[-@]/.test(t) &&
    !/\.[A-Z]\w*$/.test(t) && // Go-style identifiers such as framework/streaming.Accumulator // CSS variables (--radius-sm/md) and npm packages (@scope/pkg)
    /\/./.test(t.replace(/\/$/, '')) && // a bare dir such as run/ is too vague to check
    !/^[\w-]+(\.[\w-]+)+\//.test(t) && // domains such as github.com/x
    !/(^|\/)\.scratch\//.test(t)) // run state and evidence come and go
}
// A `file:line` or `file:a-b` citation claims the file exists and is at least that long.
const lineCite = (p) => p.match(/^(.*?):(\d+)(?:-(\d+))?$/)
const longEnough = (f, n) => !n || (statSync(f).isFile() && readFileSync(f, 'utf8').split('\n').length >= n)
function exists(claim, docDir) {
  let p = claim.replace(/[.,;:]+$/, '')
  const cite = lineCite(p)
  const line = cite ? Number(cite[3] || cite[2]) : 0
  if (cite) p = cite[1]
  if (p.startsWith('~/')) return existsSync(join(homedir(), p.slice(2))) && longEnough(join(homedir(), p.slice(2)), line)
  const hit = [docDir, project, ...repos].map((base) => join(base, p)).find(existsSync)
  if (hit) return longEnough(hit, line)
  // Branch names (chore/x, origin/main) are claims too; accept any that exists in a repo.
  const ref = p.replace(/^origin\//, '')
  return repos.some((r) => git(r, 'rev-parse', '--verify', '--quiet', `refs/heads/${ref}`) !== null ||
    git(r, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${ref}`) !== null)
}
// Only anchored claims are checked: the first segment must exist under a base, so model ids (openai/gpt-4o),
// import paths (net/http) and repo slugs are ignored while a moved or deleted file inside a known dir is caught.
function anchored(claim, docDir) {
  const p = claim.replace(/[.,;:]+$/, '')
  if (p.startsWith('~/')) return true
  const first = p.split('/').filter((x) => x !== '.')[0]
  return first === '..' || [docDir, project, ...repos].some((base) => existsSync(join(base, first)))
}
for (const doc of docs.filter(existsSync)) {
  const lines = readFileSync(doc, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const claim of pathClaims(line)) {
      if (anchored(claim, dirname(doc)) && !exists(claim, dirname(doc))) fails.push(`${rel(doc)}:${i + 1}: path \`${claim}\` does not exist (fix the doc, or write the path from the project folder)`)
    }
  })
}

// 2. Branches named in the project AGENTS.md repo table.
for (const row of table.slice(2)) {
  const cells = row.split('|').map((c) => c.trim())
  const repo = rowRepo(row)
  if (!repo || !isDir(join(project, repo)) || reference.has(repo)) continue
  for (const col of branchCols) {
    const branch = (cells[col] || '').match(/^`([^`]+)`/)?.[1]
    if (!branch) { warns.push(`AGENTS.md: ${repo} has no ${header[col]} yet (ask the user)`); continue }
    if (/<[^>]+>/.test(branch)) {
      // A pattern such as version/<xx>: releases come and go, so only warn when none exists.
      const re = new RegExp(`^${branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/<[^>]+>/g, '[^/]+')}$`)
      const refs = (git(join(project, repo), 'for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin') || '').split('\n')
      if (!refs.some((r) => re.test(r))) warns.push(`AGENTS.md: ${repo} has no remote branch matching ${header[col]} \`${branch}\` yet`)
      continue
    }
    // Path checks read the working tree, so a checkout on another branch makes them FAIL on paths that exist on the base.
    const head = git(join(project, repo), 'branch', '--show-current')
    if (/base branch/i.test(header[col]) && head && head !== branch) warns.push(`${repo}: checked out on \`${head}\`, not its base branch \`${branch}\`; path checks above read \`${head}\``)
    if (git(join(project, repo), 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`) === null &&
        git(join(project, repo), 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`) === null) {
      fails.push(`AGENTS.md: ${repo} ${header[col]} \`${branch}\` is not a branch`)
    }
    // A release branch such as version/v1.1 goes stale when a newer one is cut.
    const rel = branch.match(/^(.+\/v?)(\d+(?:\.\d+)*)$/)
    if (rel) {
      const num = (v) => v.split('.').map(Number)
      const newer = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) } return false }
      const refs = (git(join(project, repo), 'for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin') || '').split('\n')
      const later = refs.filter((r) => r.startsWith(rel[1]) && /^\d+(\.\d+)*$/.test(r.slice(rel[1].length)) && newer(num(r.slice(rel[1].length)), num(rel[2])))
      if (later.length) warns.push(`AGENTS.md: ${repo} ${header[col]} is \`${branch}\` but origin has newer ${later.map((r) => `\`${r}\``).join(', ')}; ask the user which release is current and update the table`)
    }
  }
}

// 3. Feature map shape.
const checker = join(homedir(), '.claude/skills/scout/scripts/check-feature-map.mjs')
for (const s of verifySkills) {
  if (!isDir(join(s, 'features'))) { fails.push(`${rel(s)}: no features/ map`); continue }
  try { execFileSync('node', [checker, join(s, 'features')], { stdio: 'pipe' }) } catch (e) {
    fails.push(`${rel(s)}/features: off the pstack shape:\n  ${String(e.stdout).trim().split('\n').filter(Boolean).slice(0, -1).join('\n  ')}`)
  }
}
if (verifySkills.length === 0) fails.push('.agents/skills/verify-*: no verification skill (run /scout)')

// 4. Staleness warnings.
const since = (repo, date, paths) => Number(git(repo, 'rev-list', '--count', `--since=${date}`, 'HEAD', '--', ...paths) || 0)
for (const s of verifySkills) {
  const notes = join(project, '.scratch', s.split('/').pop())
  // Full-pass notes are maintain-<YYYY-MM-DD>.md (rescout); scoped ones carry a suffix and do not count.
  const passes = isDir(notes) ? readdirSync(notes).map((f) => /^maintain-(\d{4})-?(\d{2})-?(\d{2})\.md$/.exec(f)).filter(Boolean).map((m) => `${m[1]}-${m[2]}-${m[3]}`).sort() : []
  const date = passes.at(-1)
  if (!date) { warns.push(`${rel(s)}: no rescout pass recorded; run /rescout`); continue }
  const moved = repos.map((r) => [r.split('/').pop(), since(r, date, ['.'])]).filter(([, n]) => n > 0)
  const ageDays = Math.floor((Date.now() - Date.parse(date)) / 864e5)
  if (moved.length && ageDays >= 7) warns.push(`${rel(s)}: last rescout pass ${date} (${ageDays} days); since then ${moved.map(([r, n]) => `${r} +${n} commits`).join(', ')}; run /rescout`)
}
const BUILD_FILES = ['package.json', 'go.mod', 'Makefile', '.gitlab-ci.yml', '.oxlintrc.json', '.golangci.yml', '.golangci.yaml', 'pyproject.toml', 'pubspec.yaml']
for (const r of ours) {
  const touched = git(r, 'log', '-1', '--format=%cI', '--', 'AGENTS.md') || (existsSync(join(r, 'AGENTS.md')) ? new Date(statSync(join(r, 'AGENTS.md')).mtimeMs).toISOString() : null)
  if (!touched) { fails.push(`${rel(r)}/AGENTS.md: missing`); continue }
  const n = since(r, touched, BUILD_FILES.filter((f) => existsSync(join(r, f))))
  if (n > 0) warns.push(`${rel(r)}/AGENTS.md: ${n} commit(s) changed build or lint config after it was last updated; recheck its commands`)
}

for (const f of fails) console.log(`FAIL ${f}`)
for (const w of warns) console.log(`warn ${w}`)
console.log(fails.length ? `\n${fails.length} failure(s), ${warns.length} warning(s)` : `docs ok (${warns.length} warning(s))`)
process.exit(fails.length ? 1 : 0)
