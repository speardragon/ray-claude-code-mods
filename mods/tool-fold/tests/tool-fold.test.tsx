import { describe, expect, test } from 'claude-code/testing'

import { meta, status, subject, toolName } from '../hooks/summary'

const row = (tool: string, input: unknown, output?: unknown, flags: Partial<{ isRunning: boolean; isErrored: boolean; isInterrupted: boolean }> = {}) => ({
  tool,
  input,
  output,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...flags,
})

describe('summary', () => {
  test('names what a call acted on, relative to the session', async () => {
    expect(subject(row('Bash', { command: 'npm   test\n  -- --watch' }), '/repo', '/home/me')).toBe('npm test -- --watch')
    expect(subject(row('Read', { file_path: '/repo/src/a.ts', offset: 10, limit: 5 }), '/repo', '/home/me')).toBe('src/a.ts:10-14')
    expect(subject(row('Edit', { file_path: '/home/me/notes.md' }), '/repo', '/home/me')).toBe('~/notes.md')
    expect(toolName('mcp__claude_ai_Slack__slack_send_message')).toBe('Slack · slack_send_message')
  })

  test('says how it went', async () => {
    expect(meta(row('Bash', { command: 'ls' }, { stdout: 'a\nb\nc\n', stderr: '' })).map(p => p.text)).toEqual(['3 lines'])
    expect(meta(row('Edit', {}, { structuredPatch: [{ lines: ['+a', '+b', '-c', ' d'] }] })).map(p => p.text)).toEqual(['+2', '−1'])
    expect(meta(row('Write', {}, { type: 'create', content: 'x\ny\n', structuredPatch: [] })).map(p => p.text)).toEqual(['new · 2 lines'])
    expect(meta(row('Bash', {}, 'Error: command not found: foo', { isErrored: true }))[0]).toEqual({ text: 'command not found: foo', tone: 'error' })
    expect(status(row('Bash', {}, undefined, { isRunning: true }))).toBe('running')
  })
})

const USE = {
  plugin: 'tool-fold',
  component: 'ToolUse',
  requestId: 't1',
  props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'npm test' }, isRunning: false, isErrored: false, isInterrupted: false, output: { stdout: 'ok\n', stderr: '' } },
} as const
const RESULT = {
  plugin: 'tool-fold',
  component: 'ToolResult',
  requestId: 't1',
  props: { tool_use_id: 't1', tool: 'Bash', output: { stdout: 'ok\n', stderr: '' }, isErrored: false },
} as const

test('a call is one line with its result folded; a click unfolds it, /tools off hands it back', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tools' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine draws it</Text>
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const use = await $.ui.mount({ ...USE, surface: 'terminal' })
  const line = await use.find({ type: 'Client', key: 'row-t1' })
  expect(line).toBeDefined()
  expect(await use.find({ type: 'Text', text: /▸ ● Bash {6}npm test/, in: 'row-t1' })).toBeDefined()
  expect(await use.find({ type: 'Text', text: '1 line', in: 'row-t1' })).toBeDefined()

  const folded = await $.ui.mount({ ...RESULT, surface: 'terminal' })
  expect(await folded.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  await folded.unmount()

  await use.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'row-t1' })
  expect(await use.find({ type: 'Text', text: /^▾ /, in: 'row-t1' })).toBeDefined()
  const unfolded = await $.ui.mount({ ...RESULT, surface: 'terminal' })
  expect(await unfolded.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await unfolded.unmount()
  await use.unmount()

  await $.command.run({ command: 'tools', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const off = await $.ui.mount({ ...USE, surface: 'terminal' })
  expect(await off.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await off.unmount()
})

test('verbose marks every row expanded: rows fold anyway, unless yieldExpanded leaves them to the engine', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tools' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine draws it</Text>
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...USE, props: { ...USE.props, isExpanded: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Client', key: 'row-t1' })).toBeDefined()
  await ui.unmount()
})

test('with yieldExpanded, an expanded row is the engine\'s', { options: { yieldExpanded: true } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'tools' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine draws it</Text>
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...USE, props: { ...USE.props, isExpanded: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await ui.unmount()
})
