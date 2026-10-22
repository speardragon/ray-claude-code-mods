// Screenshots of prompt-history on demo prompts, in Korean and in English (scripts/shots/render.mjs).
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
const PROMPTS = {
  ko: [
    [26 * 60, '로그인 페이지 만들어줘. 이메일이랑 비밀번호 입력 받고, 소셜 로그인은 구글만 일단 붙여줘'],
    [25 * 60, '비밀번호 찾기 링크도 폼 아래에 넣어줘'],
    [24 * 60 + 40, '에러 메시지가 너무 딱딱한데 좀 더 친절하게 바꿔줘'],
    [190, 'API 응답 타입을 zod 스키마로 검증하도록 바꿔줘'],
    [150, '테스트가 두 개 깨지는데 원인 찾아서 고쳐줘'],
    [95, '대시보드 차트 색상을 GitHub 다크 톤으로 맞춰줘'],
    [62, 'useDebounce 훅 따로 빼서 검색창에 적용해줘'],
    [41, '모바일에서 사이드바가 화면을 다 가리는데,\n768px 아래에서는 햄버거 메뉴로 접히게 해주고\n열렸을 때 바깥을 누르면 닫히게 해줘.\n\n애니메이션은 150ms 정도로 짧게, 너무 튀지 않게 부탁해.\n접근성도 챙겨줘: aria-expanded, Esc로 닫기, 포커스 트랩까지.'],
    [27, '방금 거 커밋 메시지 작성해줘'],
    [12, 'README에 설치 방법 섹션 추가해줘'],
    [3, '배포 전에 빠뜨린 거 없는지 체크리스트로 정리해줘'],
  ],
  en: [
    [26 * 60, 'Build a login page with email and password, and add Google sign-in for now'],
    [25 * 60, 'Put a "Forgot password?" link under the form'],
    [24 * 60 + 40, 'The error messages read a bit harsh, make them friendlier'],
    [190, 'Validate the API responses with zod schemas'],
    [150, 'Two tests are failing, find out why and fix them'],
    [95, 'Match the dashboard chart colors to the GitHub dark palette'],
    [62, 'Pull useDebounce out into its own hook and use it in the search box'],
    [41, 'On mobile the sidebar covers the whole screen.\nBelow 768px, fold it into a hamburger menu,\nand close it when you tap outside.\n\nKeep the animation short, around 150ms, nothing flashy.\nMind accessibility too: aria-expanded, Esc to close, and a focus trap.'],
    [27, 'Write a commit message for that'],
    [12, 'Add an install section to the README'],
    [3, 'Make a checklist of anything we might have missed before shipping'],
  ],
} as const

const TRANSCRIPT = {
  ko: [
    ['prompt', '모바일에서 사이드바가 화면을 다 가리는데, 768px 아래에서는 햄버거'],
    ['prompt', '메뉴로 접히게 해주고 열렸을 때 바깥을 누르면 닫히게 해줘. …'],
    ['blank', ''],
    ['bullet', '사이드바를 768px 아래에서 접히는 드로어로 바꿀게요.'],
    ['blank', ''],
    ['tool', 'Update(src/components/Sidebar.tsx)'],
    ['out', 'Updated with 24 additions and 6 removals'],
    ['tool', 'Write(src/hooks/useFocusTrap.ts)'],
    ['out', 'Wrote 38 lines'],
    ['blank', ''],
    ['bullet', '드로어가 열리면 aria-expanded를 켜고, Esc와 바깥 클릭으로'],
    ['bullet', '닫히며, 열린 동안은 포커스가 안에 머뭅니다.'],
    ['blank', ''],
    ['prompt', '방금 거 커밋 메시지 작성해줘'],
    ['blank', ''],
    ['bullet', 'feat: collapse the sidebar into a drawer below 768px'],
    ['blank', ''],
    ['prompt', '/prompts'],
    ['out', 'prompt-history: 11 prompts.'],
  ],
  en: [
    ['prompt', 'On mobile the sidebar covers the whole screen. Below 768px, fold it'],
    ['prompt', 'into a hamburger menu, and close it when you tap outside. …'],
    ['blank', ''],
    ['bullet', "I'll turn the sidebar into a drawer below 768px."],
    ['blank', ''],
    ['tool', 'Update(src/components/Sidebar.tsx)'],
    ['out', 'Updated with 24 additions and 6 removals'],
    ['tool', 'Write(src/hooks/useFocusTrap.ts)'],
    ['out', 'Wrote 38 lines'],
    ['blank', ''],
    ['bullet', 'The drawer sets aria-expanded, closes on Esc and outside taps,'],
    ['bullet', 'and keeps focus inside while it is open.'],
    ['blank', ''],
    ['prompt', 'Write a commit message for that'],
    ['blank', ''],
    ['bullet', 'feat: collapse the sidebar into a drawer below 768px'],
    ['blank', ''],
    ['prompt', '/prompts'],
    ['out', 'prompt-history: 11 prompts.'],
  ],
}

const WIDTH = 100
const HEIGHT = 30

for (const lang of ['ko', 'en'] as const) {
  test(`prompt-history-${lang}`, async ($, on) => {
    const now = Date.now()
    const rows = PROMPTS[lang].map(([ago, text], i) =>
      JSON.stringify({ type: 'user', uuid: `p${i + 1}`, timestamp: new Date(now - ago * MIN).toISOString(), origin: { kind: 'human' }, message: { role: 'user', content: text } }),
    )
    on('command.register', () => ({ value: { command: 'prompts' } }))
    on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
    on('session.id', () => ({ value: 'demo' }))
    on('process.run', (_, e) => ({
      value: { exitCode: 0, stdout: e.argv[0] === 'date' ? '+0900\n' : rows.join('\n'), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({
      plugin: 'prompt-history',
      component: 'Pane',
      requestId: 'prompt-history',
      surface: 'terminal',
      props: { title: 'Prompts', isFocused: true, bodyColumns: WIDTH, placement: 'dock', scroll: { offset: 0, bodyRows: HEIGHT }, view: {} },
    })
    if (lang === 'en') await ui.post({ action: 'locale' }, { in: 'toolbar' })
    await ui.post({ pick: 'p8' }, { in: 'list' })
    await ui.pointer({ type: 'move', x: 10, y: 6, in: 'list' }) // the pointer resting on a row
    await shoot(ui, { name: `prompt-history-${lang}`, width: WIDTH, height: HEIGHT, title: 'claude — ~/acme-web', transcript: TRANSCRIPT[lang], transcriptColumns: 74 })
  })
}
