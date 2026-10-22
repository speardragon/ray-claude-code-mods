<h1 align="center">ray-claude-code-mods</h1>

<p align="center"><b>내가 쓰려고 만든 Claude Code mods 모음.</b><br>
function hooks 기반 플러그인: 채팅 옆 패널, 프롬프트 위 밴드, 가드 등. 원하는 것만 골라 설치하세요.</p>

## 🧩 Mods

| Mod | 하는 일 | 형태 |
| --- | --- | --- |
| [diff-explorer](mods/diff-explorer) | Claude가 수정한 파일을 VS Code 스타일 트리 + GitHub 다크 diff로 옆 패널에 표시. `/diffs` | pane, command |
| [prompt-history](mods/prompt-history) | 이번 세션에 보낸 프롬프트 목록(상대 시간·날짜), 클릭하면 전문 보기 + 그 위치로 이동. `/prompts` | pane, command |

## 🚀 설치

Claude Code 프롬프트에서 (마켓플레이스 추가를 물으면 `y`):

```
/plugin install diff-explorer --marketplace speardragon/ray-claude-code-mods
/plugin install prompt-history --marketplace speardragon/ray-claude-code-mods
```

셸에서:

```sh
claude plugin marketplace add speardragon/ray-claude-code-mods
claude plugin install diff-explorer@ray-claude-code-mods
claude plugin install prompt-history@ray-claude-code-mods
```

데스크톱 앱에서는 프롬프트 옆 `+` → Plugins → Add marketplace에 `speardragon/ray-claude-code-mods`, 그다음 Add plugin.

## 🛠 로컬에서 쓰기 / 개발하기

이 폴더 자체를 마켓플레이스로 등록하면, 설치본이 아니라 **이 폴더를 직접 읽습니다**. 코드를 고친 뒤
`/reload-plugins`만 하면 바로 반영됩니다 (버전 올리기나 재설치 불필요).

```sh
git clone https://github.com/speardragon/ray-claude-code-mods.git
claude plugin marketplace add ./ray-claude-code-mods
claude plugin install diff-explorer@ray-claude-code-mods
```

한 세션에서만 잠깐 띄워보려면:

```sh
claude --plugin-dir mods/diff-explorer
```

## ➕ 새 mod 만들기

```sh
node scripts/new-mod.mjs <name> "<한 줄 설명>"   # templates/mod 복사 + marketplace.json 등록
./scripts/check.sh <name>                        # validate + test
```

Claude Code 안에서 "새 mod 만들어줘"라고 하면 `plugin-authoring` 스킬이 API 타입과 예제를 불러옵니다.
mod 하나의 구조:

```
mods/<name>/
├── .claude-plugin/plugin.json   # 이름, 버전, 설명, userConfig, types
├── hooks/hooks.json             # { "modules": ["./register.tsx"] }
├── hooks/register.tsx           # export const register: Register = (on, options) => { ... }
├── types/index.d.ts             # $.state에 두는 값의 타입 계약
├── tests/*.test.tsx             # claude plugin test
├── tsconfig.json                # .claude-plugin/types/tsconfig.json 확장 (타입은 로드 시 자동 생성)
└── README.md
```

## ✅ 체크

```sh
./scripts/check.sh            # 모든 mod validate + test, marketplace.json과 mods/ 일치 확인
```

`claude plugin test`가 Claude Code 세션 안에서 거부되면 `CLAUDE_CONFIG_DIR=$(mktemp -d) ./scripts/check.sh`로 실행하세요.

## 📦 mod를 바꿨다면

- `mods/<name>/.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json` 양쪽의 `version`을 올리기
- 이 README의 표 갱신

## License

[MIT](LICENSE)
