#!/usr/bin/env node
// Screenshots for the READMEs, from the mods' own drawing: each mods/<name> with a fixture at
// scripts/shots/<name>.shot.tsx is copied to a temp folder with that fixture as its only test,
// `claude plugin test` mounts its pane on demo data and hands the drawn trees back (in the error
// a test throws: the test kit has no other way out), and each tree is laid out as cells in HTML
// inside a terminal window and photographed by headless Chrome.
//   node scripts/shots/render.mjs [mod ...]
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const out = join(root, 'images')
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync)

// Nerd Font v3's symbols, for the icons the system's Meslo may predate; fetched once into a cache.
const SYMBOLS_URL = 'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/NerdFontsSymbolsOnly.zip'
const cache = join(root, 'scripts/shots/.cache')

function symbolsFont() {
  const font = join(cache, 'SymbolsNerdFontMono-Regular.ttf')
  if (existsSync(font)) return font
  mkdirSync(cache, { recursive: true })
  const zip = join(cache, 'symbols.zip')
  execFileSync('curl', ['-sSL', '-o', zip, SYMBOLS_URL])
  execFileSync('unzip', ['-o', '-q', zip, 'SymbolsNerdFontMono-Regular.ttf', '-d', cache])
  rmSync(zip, { force: true })
  return font
}

const CELL_W = 8.43 // px per column at 14px Meslo (its advance is 0.602em)
const CELL_H = 18 // px per row
const FG = '#c9d1d9'
const DIM = '#7d8590'

// ---- capture ------------------------------------------------------------------------------

// A fixture that reads globalThis.__SHOT_INDEX__ is run once per shot (the test kit cuts a long
// output short, and each shot carries its whole drawing); any other runs once for all its shots.
function runFixture(mod, source) {
  const work = mkdtempSync(join(tmpdir(), `shot-${mod}-`))
  cpSync(join(root, 'mods', mod), join(work, mod), { recursive: true, filter: src => !src.includes('/.claude-plugin/types') })
  rmSync(join(work, mod, 'tests'), { recursive: true, force: true })
  mkdirSync(join(work, mod, 'tests'))
  writeFileSync(join(work, mod, 'tests', 'shot.test.tsx'), source)
  const run = spawnSync('claude', ['plugin', 'test', join(work, mod)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  rmSync(work, { recursive: true, force: true })
  const text = `${run.stdout}${run.stderr}`
  return { shots: [...text.matchAll(/@@SHOT@@([\s\S]*?)@@END@@/g)].map(m => JSON.parse(m[1])), text }
}

function capture(mod) {
  const fixture = readFileSync(join(root, 'scripts/shots', `${mod}.shot.tsx`), 'utf8')
  if (!fixture.includes('__SHOT_INDEX__')) {
    const { shots, text } = runFixture(mod, fixture)
    if (shots.length === 0) throw new Error(`${mod}: the fixture drew nothing\n${text.slice(0, 4000)}`)
    return shots
  }
  const all = []
  for (let k = 0; k < 50; k++) {
    const { shots, text } = runFixture(mod, `;(globalThis as Record<string, unknown>).__SHOT_INDEX__ = ${k}\n${fixture}`)
    if (shots.length === 0) {
      if (k === 0) throw new Error(`${mod}: the fixture drew nothing\n${text.slice(0, 4000)}`)
      break
    }
    all.push(...shots)
  }
  return all
}

// ---- layout as HTML -----------------------------------------------------------------------

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const EMOJI = /\p{Emoji_Presentation}/u
const isWide = (cp, ch = String.fromCodePoint(cp)) =>
  EMOJI.test(ch) ||
  (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0x1f300 && cp <= 0x1faff)
const isGlyph = cp => (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000

// Every character in a box of its own cells, so fallback fonts cannot drift the columns.
function cells(text) {
  let html = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (isWide(cp, ch)) html += `<i class="${EMOJI.test(ch) ? 'em' : 'w2'}">${esc(ch)}</i>`
    else if (isGlyph(cp)) html += `<i class="nf">${esc(ch)}</i>`
    else if (cp > 0x2000) html += `<i class="w1">${esc(ch)}</i>`
    else html += esc(ch)
  }
  return html
}

const css = (props, extra = {}) => {
  const style = { ...extra }
  if (props.color) style.color = props.color
  if (props.backgroundColor) style.background = props.backgroundColor
  if (props.dimColor) style.color = DIM
  if (props.weight === 'bold' || props.weight === 'semibold' || props.bold) style['font-weight'] = '700'
  if (props.italic) style['font-style'] = 'italic'
  if (props.strikethrough) style['text-decoration'] = 'line-through'
  if (props.underline) style['text-decoration'] = 'underline'
  return Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')
}

const size = (v, unit) => (typeof v === 'number' ? `${v * unit}px` : typeof v === 'string' ? v : undefined)

function inline(node, clients) {
  if (typeof node === 'string') return cells(node)
  if (!node || typeof node !== 'object') return ''
  const kids = (node.children ?? []).map(c => inline(c, clients)).join('')
  if (node.type === 'Text') return `<span style="${css(node.props ?? {})}">${kids}</span>`
  if (node.type === 'Button') {
    const p = node.props ?? {}
    const label = kids || cells(p.label ?? '')
    if (p.plain) return `<span>${p.hotkey ? `<span style="color:#2f81f7">${p.hotkey}: </span>` : ''}${label}</span>`
    const color = p.variant === 'primary' ? '#2f81f7' : FG
    return `<span style="color:${color};font-weight:700">[ ${label} ]</span>`
  }
  return block(node, clients)
}

function block(node, clients) {
  if (typeof node === 'string') return `<div class="line">${cells(node)}</div>`
  if (!node || typeof node !== 'object') return ''
  const p = node.props ?? {}
  if (node.type === 'Client') {
    const drawn = clients[p.key]
    const style = css({}, { width: size(p.width, CELL_W), height: size(p.height, CELL_H), overflow: 'hidden', display: 'flex', 'flex-direction': 'column', 'flex-shrink': '0' })
    return `<div style="${style}">${drawn ? block(drawn, clients) : ''}</div>`
  }
  if (node.type === 'Text') {
    return `<div class="line" style="${css(p)}">${(node.children ?? []).map(c => inline(c, clients)).join('')}</div>`
  }
  if (node.type === 'Button') return `<div class="line">${inline(node, clients)}</div>`
  if (node.type === 'Code') {
    const lines = String(p.source ?? '').split('\n')
    const start = p.startLine
    const gw = start ? String(start + lines.length - 1).length : 0
    return lines
      .map((l, i) => `<div class="line">${start ? `<span style="color:${DIM}">${String(start + i).padStart(gw)} </span>` : ''}<span style="color:${FG}">${cells(l)}</span></div>`)
      .join('')
  }
  // Box, and Fragment as a column.
  const style = css(p, {
    display: p.display === 'none' ? 'none' : 'flex',
    'flex-direction': p.flexDirection ?? 'column',
    width: size(p.width, CELL_W),
    height: size(p.height, CELL_H),
    overflow: p.overflow === 'hidden' ? 'hidden' : undefined,
    'justify-content': p.justifyContent,
    'align-items': p.alignItems,
    'flex-shrink': '0',
    'flex-grow': p.flexGrow !== undefined ? String(p.flexGrow) : undefined,
    gap: typeof p.gap === 'number' ? `${p.gap * CELL_W}px` : undefined,
  })
  const clean = style.split(';').filter(kv => !kv.endsWith(':undefined')).join(';')
  return `<div style="${clean}">${(node.children ?? []).map(c => block(c, clients)).join('')}</div>`
}

// The pane beside a transcript, in a terminal window: what the person sees in the dock.
function page(shot, symbols) {
  const pane = block(shot.tree, shot.clients)
  const paneW = shot.width * CELL_W
  const paneH = shot.height * CELL_H
  const transcript = (shot.transcript ?? [])
    .map(([kind, text]) => {
      const color = { prompt: '#e6edf3', bullet: '#e6edf3', tool: '#e6edf3', out: DIM, dim: DIM, ok: '#3fb950', blank: FG }[kind] ?? FG
      const lead = { prompt: '<span style="color:#7d8590">&gt; </span>', bullet: '<span style="color:#e6edf3">⏺ </span>', tool: '<span style="color:#3fb950">⏺ </span>', out: '<span style="color:#7d8590">  ⎿  </span>' }[kind] ?? ''
      const bg = kind === 'prompt' ? 'background:#161b22;' : ''
      return `<div class="line" style="color:${color};${bg}">${lead}${cells(text)}</div>`
    })
    .join('')
  const leftW = (shot.transcriptColumns ?? 0) * CELL_W
  const left = leftW
    ? `<div style="width:${leftW}px;height:${paneH}px;overflow:hidden;padding:0 ${CELL_W}px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end">${transcript}<div style="height:${CELL_H}px"></div><div class="line" style="border:1px solid #30363d;border-radius:4px;color:${DIM};padding:0 ${CELL_W}px">&gt; </div></div><div style="width:1px;background:#30363d"></div>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Meslo; src: local("MesloLGS Nerd Font Mono"), local("MesloLGS NF"), local("MesloLGS NF Regular"); }
  @font-face { font-family: NerdSymbols; src: url("file://${symbols}"); }
  html, body { margin: 0; background: transparent; }
  body { padding: 28px; font: 14px/${CELL_H}px Meslo, Menlo, "Apple SD Gothic Neo", monospace; color: ${FG}; -webkit-font-smoothing: antialiased; }
  .win { display: inline-block; border-radius: 10px; overflow: hidden; background: #0d1117; box-shadow: 0 18px 50px rgba(0,0,0,.45), 0 0 0 1px #30363d; }
  .bar { height: 30px; background: #161b22; display: flex; align-items: center; padding: 0 12px; gap: 8px; border-bottom: 1px solid #30363d; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .title { flex: 1; text-align: center; color: #7d8590; font: 12px -apple-system, "Apple SD Gothic Neo", sans-serif; margin-right: 52px; }
  .body { display: flex; padding: ${CELL_H / 2}px 0; }
  .line { height: ${CELL_H}px; white-space: pre; overflow: hidden; flex-shrink: 0; }
  i { font-style: normal; display: inline-block; text-align: center; overflow: visible; }
  i.w1 { width: ${CELL_W}px; }
  i.em { width: ${CELL_W * 2}px; font-size: 13px; }
  i.nf { width: ${CELL_W}px; font-family: NerdSymbols; font-size: 12px; vertical-align: top; }
  i.w2 { width: ${CELL_W * 2}px; font-family: "Apple SD Gothic Neo", sans-serif; font-size: 16.5px; letter-spacing: -0.5px; }
  .pane { width: ${paneW}px; height: ${paneH}px; overflow: hidden; }
</style></head><body><div class="win">
  <div class="bar"><div class="dot" style="background:#ff5f57"></div><div class="dot" style="background:#febc2e"></div><div class="dot" style="background:#28c840"></div><div class="title">${esc(shot.title ?? 'claude')}</div></div>
  <div class="body">${left}<div class="pane">${pane}</div></div>
</div></body></html>`
}

// ---- photograph ---------------------------------------------------------------------------

function photograph(shot, html) {
  const dir = mkdtempSync(join(tmpdir(), 'shot-html-'))
  const file = join(dir, 'page.html')
  writeFileSync(file, html)
  const w = Math.ceil(56 + (shot.transcriptColumns ?? 0) * CELL_W + (shot.transcriptColumns ? 1 : 0) + shot.width * CELL_W)
  const h = Math.ceil(56 + 31 + CELL_H + shot.height * CELL_H)
  const png = join(out, `${shot.name}.png`)
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`,
    '--force-device-scale-factor=2', '--default-background-color=00000000', `--window-size=${w},${h}`, `--screenshot=${png}`, `file://${file}`,
  ], { stdio: 'ignore', timeout: 60_000 })
  rmSync(dir, { recursive: true, force: true })
  return png
}

if (!CHROME) throw new Error('No Chrome or Chromium found for the screenshots.')
const symbols = symbolsFont()
mkdirSync(out, { recursive: true })
const mods = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : readdirSync(join(root, 'scripts/shots')).filter(f => f.endsWith('.shot.tsx')).map(f => f.replace('.shot.tsx', ''))
for (const mod of mods) {
  for (const shot of capture(mod)) {
    const png = photograph(shot, page(shot, symbols))
    console.log(`${mod}: ${png.replace(`${root}/`, '')}`)
    if (process.env.SHOT_HTML) writeFileSync(join(out, `${shot.name}.html`), page(shot, symbols))
  }
}
