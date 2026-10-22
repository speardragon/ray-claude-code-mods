// File and folder icons in the manner of VS Code's Material Icon Theme: one glyph and color per kind.
// `nerd` draws Nerd Font glyphs (seti, devicons, codicons); `plain` draws colored dots any font has.

export type IconStyle = 'nerd' | 'plain'
export type Icon = { glyph: string; color: string }

type Kind = { nerd: string; color: string }

const K = {
  ts: { nerd: '\ue628', color: '#3178c6' },
  tsx: { nerd: '\ue7ba', color: '#4fc3f7' },
  js: { nerd: '\ue60c', color: '#ffca28' },
  jsx: { nerd: '\ue7ba', color: '#ffca28' },
  dts: { nerd: '\ue628', color: '#0288d1' },
  json: { nerd: '\ue60b', color: '#f9a825' },
  md: { nerd: '\ue609', color: '#42a5f5' },
  py: { nerd: '\ue606', color: '#ffd43b' },
  html: { nerd: '\ue60e', color: '#e44d26' },
  css: { nerd: '\ue614', color: '#42a5f5' },
  sass: { nerd: '\ue603', color: '#ec407a' },
  go: { nerd: '\ue627', color: '#00acc1' },
  rust: { nerd: '\ue68b', color: '#ff7043' },
  java: { nerd: '\ue66d', color: '#f44336' },
  kotlin: { nerd: '\ue634', color: '#7f52ff' },
  swift: { nerd: '\ue699', color: '#fe5722' },
  c: { nerd: '\ue649', color: '#0288d1' },
  cpp: { nerd: '\ue646', color: '#0288d1' },
  ruby: { nerd: '\ue605', color: '#e53935' },
  php: { nerd: '\ue608', color: '#8892bf' },
  lua: { nerd: '\ue620', color: '#42a5f5' },
  dart: { nerd: '\ue64c', color: '#29b6f6' },
  shell: { nerd: '\ue691', color: '#4caf50' },
  yaml: { nerd: '\ue6a8', color: '#ff5252' },
  toml: { nerd: '\ue615', color: '#9e9e9e' },
  xml: { nerd: '\ue619', color: '#8bc34a' },
  sql: { nerd: '\ue64d', color: '#ffca28' },
  csv: { nerd: '\ue64a', color: '#8bc34a' },
  graphql: { nerd: '\ue662', color: '#e535ab' },
  prisma: { nerd: '\ue684', color: '#5c6bc0' },
  vue: { nerd: '\ue6a0', color: '#41b883' },
  svelte: { nerd: '\ue697', color: '#ff5722' },
  image: { nerd: '\ue60d', color: '#26a69a' },
  svg: { nerd: '\ue698', color: '#ffb300' },
  pdf: { nerd: '\ue67d', color: '#ef5350' },
  zip: { nerd: '\ue6aa', color: '#afb42b' },
  font: { nerd: '\ue659', color: '#f44336' },
  lock: { nerd: '\ue672', color: '#ffd54f' },
  git: { nerd: '\ue65d', color: '#e64a19' },
  docker: { nerd: '\ue650', color: '#0288d1' },
  npm: { nerd: '\ue616', color: '#e53935' },
  yarn: { nerd: '\ue6a7', color: '#2c8ebb' },
  tsconfig: { nerd: '\ue69d', color: '#0288d1' },
  eslint: { nerd: '\ue655', color: '#7e57c2' },
  babel: { nerd: '\ue639', color: '#fdd835' },
  webpack: { nerd: '\ue6a3', color: '#8ed6fb' },
  make: { nerd: '\ue673', color: '#ef5350' },
  license: { nerd: '\ue60a', color: '#ef5350' },
  env: { nerd: '\ue615', color: '#fbc02d' },
  config: { nerd: '\ue615', color: '#90a4ae' },
  test: { nerd: '\u{f0668}', color: '#00bfa5' },
  text: { nerd: '\ue64e', color: '#90a4ae' },
} satisfies Record<string, Kind>

const BY_EXT: Record<string, Kind> = {
  ts: K.ts, mts: K.ts, cts: K.ts, tsx: K.tsx, js: K.js, mjs: K.js, cjs: K.js, jsx: K.jsx,
  json: K.json, jsonc: K.json, json5: K.json, md: K.md, mdx: K.md, markdown: K.md,
  py: K.py, pyi: K.py, html: K.html, htm: K.html, css: K.css, scss: K.sass, sass: K.sass, less: K.css,
  go: K.go, rs: K.rust, java: K.java, kt: K.kotlin, kts: K.kotlin, swift: K.swift,
  c: K.c, h: K.c, cc: K.cpp, cpp: K.cpp, cxx: K.cpp, hpp: K.cpp, rb: K.ruby, php: K.php,
  lua: K.lua, dart: K.dart, sh: K.shell, bash: K.shell, zsh: K.shell, fish: K.shell,
  yml: K.yaml, yaml: K.yaml, toml: K.toml, ini: K.config, conf: K.config, xml: K.xml,
  sql: K.sql, csv: K.csv, tsv: K.csv, graphql: K.graphql, gql: K.graphql, prisma: K.prisma,
  vue: K.vue, svelte: K.svelte, png: K.image, jpg: K.image, jpeg: K.image, gif: K.image,
  webp: K.image, ico: K.image, svg: K.svg, pdf: K.pdf, zip: K.zip, gz: K.zip, tar: K.zip,
  woff: K.font, woff2: K.font, ttf: K.font, otf: K.font, lock: K.lock, txt: K.text, log: K.text,
}

const BY_NAME: Record<string, Kind> = {
  'package.json': K.npm, 'package-lock.json': K.npm, '.npmrc': K.npm,
  'yarn.lock': K.yarn, 'pnpm-lock.yaml': K.lock, 'bun.lockb': K.lock,
  'dockerfile': K.docker, 'docker-compose.yml': K.docker, 'docker-compose.yaml': K.docker,
  '.gitignore': K.git, '.gitattributes': K.git, '.gitmodules': K.git,
  'makefile': K.make, 'license': K.license, 'license.md': K.license,
  '.babelrc': K.babel, 'babel.config.js': K.babel,
}

const FOLDER_COLORS: Record<string, string> = {
  src: '#4caf50', lib: '#c0ca33', app: '#ef5350', components: '#ffc107', hooks: '#7e57c2',
  test: '#00bfa5', tests: '#00bfa5', __tests__: '#00bfa5', spec: '#00bfa5', docs: '#0288d1',
  scripts: '#ffa000', config: '#00bcd4', public: '#29b6f6', assets: '#ffb300', images: '#26a69a',
  styles: '#ec407a', utils: '#ffca28', types: '#0288d1', api: '#ffb300', server: '#ff7043',
  '.github': '#78909c', '.claude': '#d97757', '.claude-plugin': '#d97757', node_modules: '#8bc34a',
}

const FOLDER = '#90a4ae'

function kindOf(name: string): Kind {
  const low = name.toLowerCase()
  if (BY_NAME[low]) return BY_NAME[low]!
  if (/^tsconfig.*\.json$/.test(low)) return K.tsconfig
  if (/^\.?eslint/.test(low)) return K.eslint
  if (/^webpack\./.test(low)) return K.webpack
  if (/^\.env(\.|$)/.test(low)) return K.env
  if (/\.d\.ts$/.test(low)) return K.dts
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(low)) return K.test
  if (/(^|\.)(config|rc)\.[cm]?[jt]s$/.test(low) || /^\.\w+rc$/.test(low)) return K.config
  const ext = low.includes('.') ? low.slice(low.lastIndexOf('.') + 1) : ''
  return BY_EXT[ext] ?? K.text
}

export function fileIcon(name: string, style: IconStyle): Icon {
  const kind = kindOf(name)
  return { glyph: style === 'nerd' ? kind.nerd : '●', color: kind.color }
}

// The last part of a compacted name (`src/hooks`) picks the color.
export function folderIcon(name: string, isOpen: boolean, style: IconStyle): Icon {
  const last = name.slice(name.lastIndexOf('/') + 1).toLowerCase()
  const color = FOLDER_COLORS[last] ?? FOLDER
  if (style === 'plain') return { glyph: '■', color }
  return { glyph: isOpen ? '\ue5fe' : '\ue5ff', color }
}

// Codicon chevrons in nerd mode, plain triangles otherwise.
export const chevron = (isOpen: boolean, style: IconStyle) =>
  style === 'nerd' ? (isOpen ? '\ueab4' : '\ueab6') : isOpen ? '▾' : '▸'

// The pane's own controls, as codicons in nerd mode and plain symbols otherwise.
const UI = {
  sidebar: ['\uebf3', '◧'],
  collapseAll: ['\ueac5', '⊟'],
  expandAll: ['\ueb95', '⊞'],
  prev: ['\ueab5', '‹'],
  next: ['\ueab6', '›'],
  up: ['\ueab7', '▲'],
  down: ['\ueab4', '▼'],
  left: ['\ueab5', '◀'],
  right: ['\ueab6', '▶'],
  wrap: ['\ueb80', '↩'],
  diff: ['\ueae1', '±'],
  file: ['\ueae9', '≡'],
} as const

export type UiGlyph = keyof typeof UI

export const uiGlyph = (name: UiGlyph, style: IconStyle) => UI[name][style === 'nerd' ? 0 : 1]
