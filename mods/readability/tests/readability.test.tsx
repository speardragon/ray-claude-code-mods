import { describe, expect, test } from 'claude-code/testing'

import { layoutBlocks, wrap } from '../hooks/layout'
import type { Line } from '../hooks/layout'
import { parseBlocks, parseInline } from '../hooks/markdown'
import { textWidth } from '../hooks/text'

const plain = (lines: Line[]) => lines.map(l => l.map(s => s.text).join(''))

describe('markdown', () => {
  test('reads inline marks, and leaves snake_case alone', async () => {
    expect(parseInline('a **b** `c` [d](http://e) my_var_name').map(n => n.kind)).toEqual(['text', 'strong', 'text', 'code', 'text', 'link', 'text'])
    expect(parseInline('my_var_name')).toEqual([{ kind: 'text', text: 'my_var_name' }])
  })

  test('every prefix of a reply parses: a fence not yet closed is still code', async () => {
    const blocks = parseBlocks('Intro\n\n```ts\nconst a = 1\nconst b')
    expect(blocks.map(b => b.kind)).toEqual(['paragraph', 'code'])
    expect(blocks[1]).toMatchObject({ kind: 'code', lang: 'ts', isOpen: true, lines: ['const a = 1', 'const b'] })
  })

  test('nested lists, tables and quotes', async () => {
    const blocks = parseBlocks('- one\n  - two\n- three\n\n| a | b |\n| --- | ---: |\n| 1 | 2 |\n\n> said')
    expect(blocks.map(b => b.kind)).toEqual(['list', 'table', 'quote'])
    const list = blocks[0] as Extract<(typeof blocks)[number], { kind: 'list' }>
    expect(list.items).toHaveLength(2)
    expect(list.items[0]!.blocks.map(b => b.kind)).toEqual(['paragraph', 'list'])
  })
})

describe('layout', () => {
  test('wraps at spaces, anywhere in Hangul, never past the width', async () => {
    const lines = plain(wrap([{ text: '가나다라마바사 hello world again', paint: {} }], 10))
    for (const line of lines) expect(textWidth(line)).toBeLessThanOrEqual(10)
    expect(lines.join('').replace(/ /g, '')).toBe('가나다라마바사helloworldagain')
  })

  test('blocks are kept apart by one blank line, list items hang under their text', async () => {
    const lines = plain(layoutBlocks(parseBlocks('Title text\n\n- an item that wraps onto a second row'), 20))
    expect(lines[1]).toBe('')
    expect(lines[2]!.startsWith('• ')).toBe(true)
    expect(lines[3]!.startsWith('  ')).toBe(true)
  })

  test('emoji count two cells, so a table with ✅ keeps its columns', async () => {
    expect(textWidth('✅ 완료')).toBe(7)
    const lines = plain(layoutBlocks(parseBlocks('| a | b |\n| --- | --- |\n| ✅ x | y |\n| plain | z |'), 40))
    const widths = new Set(lines.map(textWidth))
    expect(widths.size).toBe(1)
    // top, header, rule, row, rule between rows, row, bottom
    expect(lines.map(l => l[0])).toEqual(['┌', '│', '╞', '│', '├', '│', '└'])
  })

  test('headings carry their level in #s; code sits in a frame', async () => {
    const lines = plain(layoutBlocks(parseBlocks('## Plan\n\n```ts\nconst a = 1\n```'), 30))
    expect(lines[0]).toBe('## Plan')
    expect(lines[1]!.startsWith('─')).toBe(true)
    expect(lines[3]!.startsWith('╭─ ts ')).toBe(true)
    expect(lines[4]!.startsWith('│ const')).toBe(true)
    expect(lines[5]!.startsWith('╰')).toBe(true)
    expect(new Set(lines.slice(3, 6).map(textWidth)).size).toBe(1)
  })

  test('a table fits its width', async () => {
    const lines = plain(layoutBlocks(parseBlocks('| name | description |\n| --- | --- |\n| a | a long description that will need to wrap |'), 30))
    for (const line of lines) expect(textWidth(line)).toBeLessThanOrEqual(30)
    expect(lines[0]!.startsWith('┌')).toBe(true)
  })
})

const REPLY = {
  plugin: 'readability',
  component: 'AssistantMessage',
  requestId: 'm1',
  props: { text: '## Plan\n\nUse **zod** for `parse`.\n\n```ts\nconst a = 1\n```', isFirstOfReply: true },
} as const

test('a reply is drawn by the mod, and by the engine once /readability turns it off', async ($, on) => {
  on('command.register', () => ({ value: { command: 'readability' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...REPLY, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^● / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'zod' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: /^const$/ })).at(0)?.props.color).toBe('#ff7b72')
  await ui.unmount()

  await $.command.run({ command: 'readability', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const off = await $.ui.mount({ ...REPLY, surface: 'terminal' })
  expect(await off.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await off.unmount()
})
