import { describe, expect, test } from 'claude-code/testing'

import { applicable, namesModules, parseList, splitId } from '../hooks/catalog'
import { mdRows } from '../hooks/markdown'

const PANE = {
  plugin: 'mod-manager',
  component: 'Pane',
  requestId: 'mod-manager',
  props: {
    title: 'Mods',
    isFocused: false,
    bodyColumns: 120,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 32 },
    view: {},
  },
} as const

const LIST = JSON.stringify([
  { id: 'diff-explorer@ray-mods', version: '0.4.1', scope: 'user', enabled: true, installPath: '/cache/diff-explorer' },
  { id: 'prompt-history@ray-mods', version: '0.2.2', scope: 'user', enabled: false, installPath: '/cache/prompt-history' },
  { id: 'skill-pack@official', version: '1.0.0', scope: 'user', enabled: true, installPath: '/cache/skill-pack' },
  { id: 'skill-pack@official', version: '1.0.0', scope: 'project', enabled: false, installPath: '/cache/skill-pack', projectPath: '/repo' },
  { id: 'elsewhere@official', version: '1.0.0', scope: 'project', enabled: true, installPath: '/cache/elsewhere', projectPath: '/other' },
])

const FILES: Record<string, string> = {
  '/cache/diff-explorer/hooks/hooks.json': '{ "modules": ["./register.tsx"] }',
  '/cache/diff-explorer/.claude-plugin/plugin.json': '{ "name": "diff-explorer", "description": "A diff pane." }',
  '/cache/diff-explorer/README.md': '# diff-explorer\n\nShows **diffs**.\n\n- one\n- two\n\n```sh\n/diffs\n```\n',
  '/cache/prompt-history/hooks/hooks.json': '{ "modules": ["./register.tsx"] }',
  '/cache/prompt-history/.claude-plugin/plugin.json': '{ "name": "prompt-history", "description": "Your prompts." }',
  '/cache/skill-pack/.claude-plugin/plugin.json': '{ "name": "skill-pack", "description": "Skills only." }',
}

describe('catalog', () => {
  test('keeps the installs that apply here, the narrowest scope winning', async () => {
    const rows = applicable(parseList(LIST), '/repo')
    expect(rows.map(r => `${r.id}:${r.scope}`).sort()).toEqual(['diff-explorer@ray-mods:user', 'prompt-history@ray-mods:user', 'skill-pack@official:project'])
  })

  test('tells a mod by its hooks module', async () => {
    expect(namesModules('{ "modules": ["./register.ts"] }')).toBe(true)
    expect(namesModules('{ "hooks": {} }')).toBe(false)
    expect(namesModules(null)).toBe(false)
    expect(splitId('a-b@market')).toEqual({ name: 'a-b', marketplace: 'market' })
  })

  test('a README becomes styled rows', async () => {
    const rows = mdRows('# Title\n\nSome **bold** and `code` [link](http://x).\n\n- item\n\n```\nraw  code\n```', 40)
    expect(rows.map(r => `${r.style}:${r.text}`)).toEqual(['h1:Title', 'blank:', 'text:Some bold and code link.', 'blank:', 'bullet:• item', 'blank:', 'code:raw  code'])
  })
})

test('the pane lists mods, shows the picked one, and a switch disables it', async ($, on) => {
  const runs: string[][] = []
  on('command.register', () => ({ value: { command: 'mods' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', (_, e) => {
    const text = FILES[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('command.list', () => ({
    value: [
      { name: 'diffs', description: 'Open the diff pane', source: 'plugin', plugin: 'diff-explorer' },
      { name: 'help', description: 'Help', source: 'builtin' },
    ],
  }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: e.argv[2] === 'list' ? LIST : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'mods', args: 'refresh', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Mods only: the skill pack has no hooks module.
    expect(await ui.find({ type: 'Text', text: /diff-explorer/, in: 'list' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /prompt-history/, in: 'list' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /skill-pack/, in: 'list' })).toBeUndefined()
    // The first is picked: its scope, its command as a button, its README.
    expect(await ui.find({ type: 'Text', text: /user scope/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\/diffs/, in: 'dcmd0' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Shows diffs\./ })).toBeDefined()
    await ui.unmount()
  }

  // All shows the skill pack too, tagged as a plugin.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.post({ action: 'filter' }, { in: 'toolbar' })
  expect(await ui.find({ type: 'Text', text: /skill-pack/, in: 'list' })).toBeDefined()

  // Rows under All: official (0), skill-pack (1), ray-mods (2), diff-explorer (3), prompt-history (4).
  // A click on diff-explorer's switch (the row's last cells) disables it at its scope.
  const width = 48 - 1
  await ui.pointer({ type: 'down', x: width - 3, y: 3, button: 'left', in: 'list' })
  await ui.pointer({ type: 'up', x: width - 3, y: 3, button: 'left', in: 'list' })
  expect(runs).toContainEqual(['claude', 'plugin', 'disable', 'diff-explorer@ray-mods', '--scope', 'user'])
  expect(await ui.find({ type: 'Text', text: /Reload to apply/, in: 'dfoot' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /OFF/, in: 'list' })).toBeDefined()
  await ui.unmount()
})
