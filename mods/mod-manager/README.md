# 🧩 mod-manager

**한국어** · [English](README.en.md)

설치한 Claude Code mod를 한 패널에서 관리합니다. 무엇이 깔려 있는지 둘러보고, README를 읽고, 하나씩 켜고 끄고,
각 mod의 패널을 버튼으로 바로 열 수 있어요.

<img src="../../images/mod-manager-ko.png" alt="mod-manager" width="100%">

## 기능

- **둘러보기**: 마켓플레이스별로 묶은 목록. `●` 켜짐 / `○` 꺼짐, 버전, 줄 끝 `ON` `OFF` 스위치.
- **상세**: 고른 mod의 버전, 마켓플레이스, 설치 범위, 설명, 그리고 README(제목 · 목록 · 코드 블록 스타일, 스크롤).
- **켜기 / 끄기**: 스위치를 누르면 `claude plugin enable|disable`을 실행합니다. 같은 플러그인이 여러 범위에 깔려 있으면
  이 프로젝트에 실제로 적용되는 것(local › project › user)을 바꿔요. 상태줄의 `⟳ Reload`로 바로 적용합니다.
- **패널 열기**: mod가 등록한 슬래시 명령이 `/diffs` 같은 버튼으로 나오고, 누르면 그 mod의 패널이 열립니다.
- **Mods / All**: 기본은 hooks 모듈이 있는 mod만, `All`로 스킬 · MCP · LSP 플러그인까지 전부.
- **안전장치**: mod-manager 자신(`this`)과 이 세션에서 개발 중인 mod(`dev`)에는 스위치가 없어요. 끄면 이 패널로 되돌릴 방법이 없어서요.

## 설치

```
/plugin install mod-manager --marketplace speardragon/ray-claude-code-mods
```

## 사용법

| 입력 | 동작 |
| --- | --- |
| `/mods` | 패널 켜기 / 끄기 (토글, 켤 때마다 설치 목록을 새로 읽음) |
| `/mods on` · `/mods off` | 패널 켜기 · 끄기 |
| `/mods refresh` | 설치 목록 다시 읽기 |
| 목록 줄 클릭 | 그 mod의 상세 보기 |
| 줄 끝 `ON` / `OFF`, 상세의 `● Enabled` | 켜기 / 끄기 |
| 상세의 `/명령` 버튼 | 그 명령 실행 (mod의 패널 열기) |
| 툴바 `Mods │ All` · `⟳ Refresh` | 필터 전환 · 다시 읽기 |
| 상태줄 `⟳ Reload` | `/reload-plugins`로 바뀐 상태 적용 |
| 목록 클릭 후 `↑` `↓` | mod 이동, `Space` 켜기 / 끄기, `Enter` 첫 번째 명령 실행 |
| 휠 · 스크롤바 | 커서가 올라간 컬럼(목록 또는 README)만 스크롤 |

## 알아두면 좋은 것

- 켜고 끈 결과는 `/reload-plugins` 뒤에 적용됩니다. `⟳ Reload`가 거절되면 상태줄 안내대로 직접 입력하세요.
- 명령 버튼으로 연 패널은 "직접 입력"이 아니라 mod가 실행한 명령으로 처리돼서, 터미널이 좁으면(144칸 미만, 전에 연 적
  있는 패널은 110칸 미만) 바로 자리 잡지 않을 수 있어요. 그럴 땐 그 명령을 직접 입력하세요.
- 목록은 `claude plugin list --json`을 읽어 만듭니다. 처음 여는 데 1~2초 걸릴 수 있어요.
