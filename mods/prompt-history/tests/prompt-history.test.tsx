import { describe, expect, test } from 'claude-code/testing'

import { wrapText } from '../hooks/text'
import { clock, dayLabel, parseOffset, relative } from '../hooks/time'
import { parseTranscript, promptText, transcriptPath } from '../hooks/transcript'

const KST = 9 * 60
const NOW = Date.UTC(2026, 9, 22, 5, 0, 0) // 14:00 in Seoul

const PANE = {
  plugin: 'prompt-history',
  component: 'Pane',
  requestId: 'prompt-history',
  props: {
    title: 'Prompts',
    isFocused: false,
    bodyColumns: 110,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const row = (uuid: string, text: string, timestamp: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'user', uuid, timestamp, origin: { kind: 'human' }, message: { role: 'user', content: text }, ...extra })

describe('time', () => {
  test('reads as minutes, hours and days ago, then a date', async () => {
    expect(relative(NOW - 10_000, NOW, KST, 'ko')).toBe('방금 전')
    expect(relative(NOW - 3 * 60_000, NOW, KST, 'ko')).toBe('3분 전')
    expect(relative(NOW - 3 * 60_000, NOW, KST, 'en')).toBe('3m ago')
    expect(relative(NOW - 5 * 3_600_000, NOW, KST, 'ko')).toBe('5시간 전')
    expect(relative(NOW - 2 * 86_400_000, NOW, KST, 'en')).toBe('2d ago')
    expect(relative(NOW - 10 * 86_400_000, NOW, KST, 'ko')).toBe('10월 12일')
    expect(relative(NOW - 10 * 86_400_000, NOW, KST, 'en')).toBe('Oct 12')
    expect(relative(Date.UTC(2025, 0, 3, 3), NOW, KST, 'ko')).toBe('2025. 1. 3.')
  })

  test('clock and day headings follow the offset', async () => {
    expect(clock(NOW, KST, 'ko')).toBe('오후 2:00')
    expect(clock(NOW, KST, 'en')).toBe('2:00 PM')
    expect(dayLabel(NOW - 3_600_000, NOW, KST, 'ko')).toBe('오늘')
    expect(dayLabel(NOW - 86_400_000, NOW, KST, 'en')).toBe('Yesterday')
    expect(dayLabel(NOW - 3 * 86_400_000, NOW, KST, 'ko')).toBe('10월 19일 (월)')
    expect(parseOffset('+0900\n')).toBe(540)
    expect(parseOffset('-0330')).toBe(-210)
  })
})

describe('transcript', () => {
  test('keeps what a person typed, and drops commands and notes', async () => {
    const lines = [
      row('a', '첫 질문', '2026-10-22T01:00:00Z'),
      row('b', '<command-name>/diffs</command-name>', '2026-10-22T01:01:00Z'),
      row('c', 'meta', '2026-10-22T01:02:00Z', { isMeta: true }),
      row('d', '두 번째\n질문', '2026-10-22T01:03:00Z'),
      'not json',
    ].join('\n')
    expect(parseTranscript(lines).map(p => p.uuid)).toEqual(['a', 'd'])
    expect(promptText([{ type: 'text', text: '  hi  ' }])).toBe('hi')
    expect(transcriptPath('/Users/me/.claude', '/Users/me/my repo', 'id')).toBe('/Users/me/.claude/projects/-Users-me-my-repo/id.jsonl')
  })

  test('wraps by cells, breaking at a space near the row end', async () => {
    expect(wrapText('hello world again', 12)).toEqual(['hello world', 'again'])
    expect(wrapText('가나다라마', 4)).toEqual(['가나', '다라', '마'])
  })
})

test('the pane lists sent prompts; hovering only lights a row, a click shows it in full', async ($, on) => {
  const transcript = [row('p1', '첫 번째 프롬프트', '2026-10-22T01:00:00Z'), row('p2', 'second prompt\nwith two lines', '2026-10-22T01:30:00Z')].join('\n')
  on('command.register', () => ({ value: { command: 'prompts' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 'sid' }))
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'date' ? '+0900\n' : transcript, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /첫 번째 프롬프트/, in: 'list' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /second prompt ↵ with two lines/, in: 'list' })).toBeDefined()
    // The newest is shown while nothing is picked; once #1 is picked (the first pass), #1 is.
    expect(await ui.find({ type: 'Text', text: surface === 'terminal' ? /with two lines/ : /첫 번째 프롬프트/ })).toBeDefined()

    // Hovering lights the row and leaves the preview as it was.
    await ui.pointer({ type: 'move', x: 5, y: 1, in: 'list' })
    expect((await ui.findAll({ type: 'Text', text: /첫 번째 프롬프트/, in: 'list' })).at(0)?.props.backgroundColor).toBe(surface === 'terminal' ? '#161b22' : '#21262d')
    expect(await ui.find({ type: 'Text', text: surface === 'terminal' ? /#2/ : /#1/, in: 'phead' })).toBeDefined()

    // A click picks it and asks the transcript to scroll to its row.
    await ui.pointer({ type: 'down', x: 5, y: 1, button: 'left', in: 'list' })
    await ui.pointer({ type: 'up', x: 5, y: 1, button: 'left', in: 'list' })
    // The click picks #1 (the transcript's scroll itself needs a live session: see README).
    await ui.pointer({ type: 'leave', x: 5, y: 1, in: 'list' })
    expect(await ui.find({ type: 'Text', text: /#1/, in: 'phead' })).toBeDefined()
    await ui.unmount()
  }
})

test('a list row never runs past its width, and its time always shows whole', async ($, on) => {
  const long = '아주 긴 한국어 프롬프트 '.repeat(20)
  const transcript = row('p1', long, new Date(Date.now() - 3 * 3_600_000).toISOString())
  on('command.register', () => ({ value: { command: 'prompts' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 'sid' }))
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'date' ? '+0900\n' : transcript, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  for (const columns of [80, 110, 140]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: columns }, surface: 'terminal' })
    const line = (await ui.findAll({ type: 'Text', text: /아주 긴/, in: 'list' })).at(0)!.text
    expect(line.endsWith('3시간 전 ')).toBe(true)
    const width = [...line].reduce((n, ch) => n + (/[가-힣]/.test(ch) ? 2 : 1), 0)
    const listWidth = Math.max(30, Math.min(64, Math.round(columns * 0.44))) - 1
    expect(width).toBe(listWidth)
    await ui.unmount()
  }
})

test('the Copy button puts the shown prompt on the clipboard and says so', async ($, on) => {
  const transcript = [row('p1', 'copy me\nplease', new Date(Date.now() - 60_000).toISOString())].join('\n')
  const copied: unknown[] = []
  on('command.register', () => ({ value: { command: 'prompts' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 'sid' }))
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'date' ? '+0900\n' : transcript, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.copy', (_, e) => {
    copied.push(e)
    return { value: { isCopied: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'copy' })
  expect(JSON.stringify(copied)).toContain('copy me\\nplease')
  expect(await ui.find({ type: 'Text', text: /✓ #1 복사됨/, in: 'pfoot' })).toBeDefined()
  await ui.unmount()
})
