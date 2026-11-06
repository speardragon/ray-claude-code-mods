import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { badgeOf, isSafeHost } from '../hooks/favicon'
import { groupOf, hostOf, labelOf, mergeGroups } from '../hooks/collect'
import { CHIP, bodyOf, columnsOf, numberCell, rowsOf } from '../hooks/rows'
import type { LinkRow } from '../hooks/rows'
import { textWidth } from '../hooks/text'
import { parseTranscript } from '../hooks/transcript'

const PANE = {
  plugin: 'link-list',
  component: 'Pane',
  requestId: 'link-list',
  props: { title: 'Links', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 24 }, view: {} },
} as const

const REPLY_1 = 'Docs are at [Claude Code 문서 · Hooks](https://docs.claude.com/en/docs/claude-code/hooks) and https://github.com/anthropics/claude-code.'
const REPLY_2 = 'Use [Zod](https://zod.dev) or see https://www.npmjs.com/package/zod, and [Zod](https://zod.dev) again.'

const row = (uuid: string, text: string, timestamp: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'assistant', uuid, timestamp, message: { role: 'assistant', content: [{ type: 'text', text }] }, ...extra })

// A moment for work a hook started and did not wait for (the test runtime has timers; the module's types do not).
const tick = () => new Promise<void>(resolve => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(resolve, 5))

const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

describe('collecting', () => {
  test('a reply becomes a group of numbered links; one without links adds nothing', async () => {
    const group = groupOf('u1', REPLY_2, 1)!
    expect(group.links.map(l => [l.no, l.url])).toEqual([
      [1, 'https://zod.dev'],
      [2, 'https://www.npmjs.com/package/zod'],
    ])
    expect(groupOf('u2', 'no links, just `https://code.dev`', 2)).toBeNull()
    expect(mergeGroups([group], [{ ...group, at: 0, uuid: 'u0' }, group]).map(g => g.uuid)).toEqual(['u0', 'u1'])
  })

  test('hosts and labels', async () => {
    expect(hostOf('https://www.npmjs.com/package/zod')).toBe('npmjs.com')
    expect(hostOf('http://user@Example.COM:8080/x')).toBe('example.com')
    expect(labelOf({ url: 'https://github.com/a/b/', text: 'https://github.com/a/b/', no: 1 })).toBe('github.com/a/b')
    expect(labelOf({ url: 'https://zod.dev', text: 'Zod', no: 1 })).toBe('Zod')
    expect(isSafeHost('docs.claude.com')).toBe(true)
    expect(isSafeHost('a;rm -rf.com')).toBe(false)
    expect(badgeOf('docs.claude.com').letter).toBe('C')
    expect(badgeOf('docs.claude.com')).toEqual(badgeOf('docs.claude.com'))
  })

  test('the transcript gives the main conversation’s replies with links', async () => {
    const lines = [
      row('a', REPLY_1, '2026-11-06T01:00:00Z'),
      row('b', 'sidechain https://x.dev', '2026-11-06T01:01:00Z', { isSidechain: true }),
      row('c', 'nothing here', '2026-11-06T01:02:00Z'),
      'not json',
    ].join('\n')
    expect(parseTranscript(lines).map(g => [g.uuid, g.links.length])).toEqual([['a', 2]])
  })
})

describe('rows', () => {
  const groups = [groupOf('u1', REPLY_1, 1_000)!, groupOf('u2', REPLY_2, 2_000)!]

  test('newest reply first, a header per reply', async () => {
    const rows = rowsOf(groups, null, 'ko', () => '방금 전')
    expect(rows.map(r => (r.kind === 'head' ? r.label : r.kind === 'link' ? r.no : '·'))).toEqual(['방금 전 · 답변 #2 · 링크 2개', '[1]', '·', '[2]', '·', '방금 전 · 답변 #1 · 링크 2개', '[1]', '·', '[2]'])
  })

  test('every link row is as wide as the list, and the host column starts at the same cell', async () => {
    const wide = [...groups, groupOf('u3', '[아주 긴 한국어 링크 제목이 열을 넘치도록 길게 이어집니다 정말로 길게](https://ko.wikipedia.org/wiki/x)', 3_000)!]
    for (const width of [60, 100, 140]) {
      const columns = columnsOf(wide, width)
      const links = rowsOf(wide, null, 'ko', () => '방금 전').filter((r): r is LinkRow => r.kind === 'link')
      const bodies = links.map(r => bodyOf(r, columns))
      expect(new Set(bodies.map(b => textWidth(b.words + b.gap + b.host))).size).toBe(1)
      expect(textWidth(bodies[0]!.words + bodies[0]!.gap + bodies[0]!.host)).toBe(columns.body)
      // The host is right-aligned: every host ends at the same cell, the longest starts the column.
      expect(new Set(bodies.map(b => textWidth(b.words + b.gap) + textWidth(b.host)))).toEqual(new Set([columns.body]))
      expect(numberCell('[1]', columns).length + CHIP + 1).toBe(columns.lead)
      expect(columns.lead + columns.body + 1).toBe(width)
    }
    expect(columnsOf(wide, 50).hostWidth).toBe(0)
  })
})

describe('the pane', () => {
  const setup = async (
    $: Parameters<TestBody>[0],
    on: Parameters<TestBody>[1],
    runs: string[][],
    transcript = [row('a', REPLY_1, '2026-11-06T01:00:00Z'), row('b', REPLY_2, '2026-11-06T01:05:00Z')].join('\n'),
  ) => {
    on('command.register', () => ({ value: { command: 'links' } }))
    on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
    on('session.id', () => ({ value: 'sid' }))
    on('process.run', (_, e) => {
      runs.push([...e.argv])
      if (e.argv[0] === 'date') return ok('+0900\n')
      if (e.argv[0] === '/bin/sh' && String(e.argv[2]).includes('favicon')) return ok(e.argv[4] === 'github.com' ? '/tmp/link-list/github.com.tile.png' : '', e.argv[4] === 'github.com' ? 0 : 7)
      if (e.argv[0] === '/bin/sh') return ok(transcript)
      return ok('')
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.panes', () => ({ value: [] }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  }

  test('lists the links on both surfaces; favicons wait for the pane to open', async ($, on) => {
    const runs: string[][] = []
    await setup($, on, runs)
    const favicons = () => runs.filter(r => r[0] === '/bin/sh' && String(r[2]).includes('favicon')).map(r => r[4])
    expect(favicons()).toEqual([])

    await $.command.run({ command: 'links', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
    expect(favicons().sort()).toEqual(['docs.claude.com', 'github.com', 'npmjs.com', 'zod.dev'])

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /답변 #2 · 링크 2개/, in: 'list' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Claude Code 문서 · Hooks/, in: 'list' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /docs\.claude\.com/, in: 'list' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\[2\]/ })).toBeDefined()
      // github.com's favicon is a picture on the terminal; the desktop draws the letter badge.
      // Each favicon is fetched on its own, after /links has answered: give it a moment.
      for (let i = 0; i < 50 && surface === 'terminal' && !(await ui.find({ type: 'Image' })); i++) await tick()
      const picture = await ui.find({ type: 'Image' })
      if (surface === 'terminal') expect(picture?.props.alt).toBe('G ')
      else expect(picture).toBeUndefined()
      await ui.unmount()
    }
  })

  test('a reply kept later adds its links; a click opens one; /links 2 opens the latest reply’s second', async ($, on) => {
    const runs: string[][] = []
    await setup($, on, runs, '')
    await $.session.append({
      message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: REPLY_2 }] },
      door: 'response',
      origin: { kind: 'model', model: 'claude' },
      uuid: 'r1',
    })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Zod/, in: 'list' })).toBeDefined()
    // Row 0 is the header; row 1 the first link (a blank row before the second).
    await ui.pointer({ type: 'down', x: 3, y: 1, button: 'left', in: 'list' })
    await ui.pointer({ type: 'up', x: 3, y: 1, button: 'left', in: 'list' })
    expect(runs.some(r => r[0] === 'open' && r[1] === 'https://zod.dev')).toBe(true)
    await ui.unmount()

    const result = await $.command.run({ command: 'links', args: '2', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
    expect(runs.some(r => r[0] === 'open' && r[1] === 'https://www.npmjs.com/package/zod')).toBe(true)
    expect(JSON.stringify(result)).toContain('npmjs')
    const none = await $.command.run({ command: 'links', args: '9', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
    expect(JSON.stringify(none)).toContain('링크가 2개')
  })

  test('/links clear empties the list', async ($, on) => {
    await setup($, on, [])
    await $.command.run({ command: 'links', args: 'clear', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /아직 답변에 나온 링크가 없어요/ })).toBeDefined()
    await ui.unmount()
  })
})
