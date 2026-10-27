// A screenshot of readability drawing a reply (scripts/shots/render.mjs).
import { test } from 'claude-code/testing'

type Node = { type?: string; props?: { key?: string }; children?: unknown[] }

const REPLY = `# 로그인 폼 검증

## 검증 규칙 정리

입력값은 **zod 스키마**로 한 번에 검사하고, 실패하면 필드별 메시지를 보여줘요. 핵심은 \`safeParse\`가 예외 대신 결과 객체를 돌려준다는 점입니다.

\`\`\`ts
const Login = z.object({
  email: z.string().email('이메일 형식이 아니에요'),
  password: z.string().min(8),
})

export function validate(input: unknown) {
  const result = Login.safeParse(input)
  return result.success ? null : result.error.flatten().fieldErrors
}
\`\`\`

| 필드 | 규칙 | 메시지 |
| --- | --- | --- |
| email | ✅ 이메일 형식 | 이메일 형식이 아니에요 |
| password | 8자 이상 | 8자 이상 입력해 주세요 |

- 서버에서도 **같은 스키마**를 재사용해요
  - 클라이언트와 규칙이 어긋날 일이 없어요
- [ ] 비밀번호 강도 표시는 다음 PR에서

> 참고: 에러 문구는 \`messages.ko.ts\`로 모아 두면 번역하기 쉬워요.`

const WIDTH = 104

test('readability', async ($, on) => {
  on('command.register', () => ({ value: { command: 'readability' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'readability',
    component: 'AssistantMessage',
    requestId: 'm1',
    surface: 'terminal',
    props: { text: REPLY, isFirstOfReply: true },
    viewport: { columns: WIDTH, rows: 50 },
  } as never)
  const tree = (await ui.drawn()) as Node
  const height = (tree.children?.length ?? 0) + 2
  throw new Error(`@@SHOT@@${JSON.stringify({ name: 'readability', width: WIDTH, height, title: 'claude — ~/acme-web', tree, clients: {} })}@@END@@`)
})
