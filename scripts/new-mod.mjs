#!/usr/bin/env node
// Scaffolds mods/<name>/ from templates/mod and lists it in .claude-plugin/marketplace.json.
//   node scripts/new-mod.mjs <name> "<one-line description>"
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const [name, description = 'A Claude Code mod.'] = process.argv.slice(2)

if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
  console.error('usage: node scripts/new-mod.mjs <name> "<description>"  (name: lowercase letters, digits, hyphens)')
  process.exit(1)
}

const dest = join(root, 'mods', name)
if (existsSync(dest)) {
  console.error(`mods/${name} already exists`)
  process.exit(1)
}

cpSync(join(root, 'templates', 'mod'), dest, { recursive: true })

// Fill the placeholders in every file, and in file names.
const fill = text => text.replaceAll('__MOD__', name).replaceAll('__DESCRIPTION__', description)
const walk = dir => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path)
    else writeFileSync(path, fill(readFileSync(path, 'utf8')))
    if (entry.includes('__MOD__')) renameSync(path, join(dir, fill(entry)))
  }
}
walk(dest)

const marketPath = join(root, '.claude-plugin', 'marketplace.json')
const market = JSON.parse(readFileSync(marketPath, 'utf8'))
const entry = { name, description, version: '0.1.0', source: `./mods/${name}`, category: 'Uncategorized', tags: [] }
const next = { ...market, plugins: [...market.plugins, entry].sort((a, b) => a.name.localeCompare(b.name)) }
writeFileSync(marketPath, JSON.stringify(next, null, 2) + '\n')

console.log(`created mods/${name} and listed it in .claude-plugin/marketplace.json`)
console.log(`next: edit mods/${name}/hooks/register.tsx, then ./scripts/check.sh ${name}`)
