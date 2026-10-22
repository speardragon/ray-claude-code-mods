// Screenshots of mod-manager on a demo set of installed plugins (scripts/shots/render.mjs).
import { test } from 'claude-code/testing'

type Node = { type?: string; props?: { key?: string }; children?: unknown[] }

async function shoot(ui: { drawn: (scope?: { in: string }) => Promise<unknown> }, meta: Record<string, unknown>) {
  const tree = await ui.drawn()
  const keys: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as Node
    if (node.type === 'Client' && node.props?.key) keys.push(node.props.key)
    node.children?.forEach(walk)
  }
  walk(tree)
  const clients: Record<string, unknown> = {}
  for (const key of keys) clients[key] = await ui.drawn({ in: key })
  throw new Error(`@@SHOT@@${JSON.stringify({ ...meta, tree, clients })}@@END@@`)
}

const PLUGINS = [
  ['diff-explorer@ray-claude-code-mods', '0.4.1', true, true, 'A VS Code-style side panel for the files Claude changes: a file tree with Material-style icons and a GitHub-dark diff preview.'],
  ['prompt-history@ray-claude-code-mods', '0.2.2', true, true, 'The prompts you typed this session, with how long ago you sent each; click one to read it in full and jump back to it.'],
  ['mod-manager@ray-claude-code-mods', '0.1.0', true, true, 'Your installed Claude Code mods in one pane.'],
  ['context-bar@claude-code-mods', '0.1.3', true, true, 'Your context window as a stacked bar above the prompt.'],
  ['now-playing@claude-code-mods', '0.2.0', false, true, 'Spotify track, progress bar and synced lyrics.'],
  ['token-weather@claude-code-mods', '0.1.1', true, true, 'A weather report for your token spend.'],
  ['glamour-dark@claude-mods', '0.1.0', true, true, "Draws the model's replies with glamour's dark style."],
  ['typescript-lsp@claude-plugins-official', '1.0.0', true, false, 'TypeScript language server.'],
] as const

const README = {
  ko: `# diff-explorer

Claude가 이번 세션에서 수정한 파일을 채팅 옆 패널에 VS Code처럼 보여주는 mod입니다.

- 왼쪽: 바뀐 파일만 모은 탐색 트리 (Material 아이콘, git 상태 색)
- 오른쪽: GitHub 다크 톤의 diff, 한 줄 안에서 바뀐 부분 강조
- 새 파일은 NEW, 삭제된 파일은 DELETED 배지

## 사용법

\`\`\`
/diffs          패널 열기
/diffs clear    추적 기록 비우기
\`\`\`

> 단축키는 패널을 한 번 클릭한 뒤 동작합니다.

## 설정

- icons: nerd(기본) 또는 plain
- autoOpen: 첫 수정 때 패널 자동 열기
`,
  en: `# diff-explorer

A VS Code-style side panel for the files Claude changes in this session.

- Left: a tree of just the changed files (Material icons, git colors)
- Right: the diff in GitHub dark, the changed part of each line marked
- New files get a NEW badge, deleted ones DELETED

## Usage

\`\`\`
/diffs          open the panel
/diffs clear    forget what was tracked
\`\`\`

> Keys work once you click into the panel.

## Options

- icons: nerd (default) or plain
- autoOpen: open the panel on the first change
`,
}

const COMMANDS = [
  ['diffs', 'diff-explorer'],
  ['diff-explorer', 'diff-explorer'],
  ['prompts', 'prompt-history'],
  ['mods', 'mod-manager'],
  ['context-bar', 'context-bar'],
  ['weather', 'token-weather'],
]

const TRANSCRIPT = {
  ko: [
    ['prompt', '/mods'],
    ['out', 'mod-manager: Click a mod to read about it,'],
    ['dim', '     its switch to turn it on or off,'],
    ['dim', '     a command to open its panel.'],
  ],
  en: [
    ['prompt', '/mods'],
    ['out', 'mod-manager: Click a mod to read about it,'],
    ['dim', '     its switch to turn it on or off,'],
    ['dim', '     a command to open its panel.'],
  ],
}

const WIDTH = 118
const HEIGHT = 30

for (const lang of ['ko', 'en'] as const) {
  test(`mod-manager-${lang}`, async ($, on) => {
    const files: Record<string, string> = {}
    for (const [id, , , isMod, description] of PLUGINS) {
      const root = `/cache/${id.split('@')[0]}`
      files[`${root}/.claude-plugin/plugin.json`] = JSON.stringify({ name: id.split('@')[0], description })
      if (isMod) files[`${root}/hooks/hooks.json`] = '{ "modules": ["./register.tsx"] }'
    }
    files['/cache/diff-explorer/README.md'] = README[lang]
    const list = PLUGINS.map(([id, version, enabled]) => ({ id, version, scope: 'user', enabled, installPath: `/cache/${id.split('@')[0]}` }))
    on('command.register', () => ({ value: { command: 'mods' } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('fs.list', () => ({ value: [] }))
    on('fs.read', (_, e) => {
      const text = files[e.path]
      if (text === undefined) throw new Error('ENOENT')
      return { value: text }
    })
    on('command.list', () => ({ value: COMMANDS.map(([name, plugin]) => ({ name, description: '', source: 'plugin', plugin })) }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(list), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await $.command.run({ command: 'mods', args: 'refresh', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

    const ui = await $.ui.mount({
      plugin: 'mod-manager',
      component: 'Pane',
      requestId: 'mod-manager',
      surface: 'terminal',
      props: { title: 'Mods', isFocused: true, bodyColumns: WIDTH, placement: 'dock', scroll: { offset: 0, bodyRows: HEIGHT }, view: {} },
    })
    await ui.post({ pick: 'diff-explorer@ray-claude-code-mods' }, { in: 'list' })
    await ui.pointer({ type: 'move', x: 8, y: 2, in: 'list' })
    await shoot(ui, { name: `mod-manager-${lang}`, width: WIDTH, height: HEIGHT, title: 'claude — ~/acme-web', transcript: TRANSCRIPT[lang], transcriptColumns: 60 })
  })
}
