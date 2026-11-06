// A screenshot of link-list on demo replies (scripts/shots/render.mjs). The favicons are the PNGs the
// mod's own script leaves in ${TMPDIR}/link-list/: fetch them first for the hosts below, or the
// shot draws their letter badges (npmjs.com's is a letter tile: its site refuses the request).
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

const MIN = 60_000
const ICONS = '/__TMPDIR__/link-list' // render.mjs reads `/__TMPDIR__/` as the temp folder
const DRAWN = new Set(['react.dev', 'developer.mozilla.org', 'zod.dev', 'vercel.com', 'docs.claude.com', 'github.com', 'ko.wikipedia.org', 'npmjs.com'])

const REPLIES: [number, string][] = [
  [40, 'React 19에서 바뀐 점은 [React 19 릴리스 노트](https://react.dev/blog/2024/12/05/react-19)에 정리돼 있어요. 폼 액션은 [MDN: FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData)도 같이 보세요.'],
  [12, '스키마 검증은 [Zod](https://zod.dev)가 가장 단순해요. 설치는 https://www.npmjs.com/package/zod 에서, 배포는 [Vercel 배포 가이드](https://vercel.com/docs/deployments)를 따라가면 됩니다.'],
  [0, '훅 이름은 [Claude Code 문서 · Hooks](https://docs.claude.com/en/docs/claude-code/hooks)에 정리돼 있고, 예제는 [anthropics/claude-code](https://github.com/anthropics/claude-code) 저장소를 보면 됩니다. 용어는 [위키백과: 후킹](https://ko.wikipedia.org/wiki/후킹)도 참고하세요.'],
]

const TRANSCRIPT = [
  ['prompt', 'Claude Code 훅 관련 자료 좀 찾아줘'],
  ['blank', ''],
  ['bullet', '훅 이름은 Claude Code 문서 · Hooks¹에 정리돼'],
  ['bullet', '있고, 예제는 anthropics/claude-code² 저장소를'],
  ['bullet', '보면 됩니다. 용어는 위키백과: 후킹³도 참고하세요.'],
  ['blank', ''],
  ['prompt', '/links'],
  ['out', 'link-list: 링크 8개. ↑↓ 고르고 Enter로 열어요.'],
  ['blank', ''],
  ['prompt', '/links 2'],
  ['out', 'link-list: ↗ 열었어요: https://github.com/anthropics/claude-code'],
]

const WIDTH = 92
const HEIGHT = 24

test('link-list', async ($, on) => {
  const now = Date.now()
  const rows = REPLIES.map(([ago, text], i) =>
    JSON.stringify({ type: 'assistant', uuid: `r${i + 1}`, timestamp: new Date(now - ago * MIN - 5_000).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }] } }),
  )
  const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('command.register', () => ({ value: { command: 'links' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 'demo' }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'date') return ok('+0900\n')
    if (e.argv[0] === '/bin/sh' && String(e.argv[2]).includes('favicon')) {
      const host = String(e.argv[4])
      return DRAWN.has(host) ? ok(`${ICONS}/${host}.tile.png`) : ok('', 6)
    }
    if (e.argv[0] === '/bin/sh') return ok(rows.join('\n'))
    return ok('')
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'links', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  const ui = await $.ui.mount({
    plugin: 'link-list',
    component: 'Pane',
    requestId: 'link-list',
    surface: 'terminal',
    props: { title: 'Links', isFocused: true, bodyColumns: WIDTH, placement: 'dock', scroll: { offset: 0, bodyRows: HEIGHT }, view: {} },
  })
  await ui.post({ press: 'down' }, { in: 'list' })
  await ui.post({ press: 'down' }, { in: 'list' })
  await ui.pointer({ type: 'move', x: 10, y: 6, in: 'list' }) // the pointer resting on a row
  await shoot(ui, { name: 'link-list', width: WIDTH, height: HEIGHT, title: 'claude — ~/acme-web', transcript: TRANSCRIPT, transcriptColumns: 56 })
})
