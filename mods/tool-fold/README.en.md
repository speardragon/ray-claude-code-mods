# 🗜️ tool-fold

[한국어](README.md) · **English**

Each tool call Claude makes as **one line**, its result block folded away: what ran, on what, and how it went, all on
the line, so the transcript stays short; **click a line to unfold** the result underneath.

<img src="../../images/tool-fold.png" alt="tool-fold" width="100%">

## What a line holds

```
▸ ● Bash      npm test -- --run src/components                5 lines
  │  │         │                                                 └ how it went
  │  │         └ what it acted on (commands; paths relative to the project)
  │  └ the tool (a color per kind, in a column)
  └ state: ● done · ● failed (red) · ◐ running · ○ interrupted
```

| Tool | On the right |
| --- | --- |
| `Bash` | lines printed, `stderr` lines, `background`, `timed out` |
| `Read` | lines read (`20 of 400 lines`) |
| `Edit` · `Write` | `+adds −dels`, or `new · N lines` for a new file |
| `WebFetch` | status code · size |
| Errors | the error's first line, in red |

## Panel mode

**`/tools panel`** turns a tool panel beside the chat on and off. The left lists this session's tool calls (state, tool,
subject, time taken, following new calls as they come); the right shows the picked call **in a view that suits its tool**.

<img src="../../images/tool-fold-panel-mongo.png" alt="tool-fold panel: a MongoDB find, Compass style" width="100%">

| Tool | Detail view |
| --- | --- |
| **MongoDB MCP** | Compass style: `server › db › collection`, a read/write/admin badge, a Filter · Project · Sort · Limit query bar, pipeline stages, `1 – N of TOTAL`, document cards (ObjectId orange · strings green · numbers/dates blue · booleans pink), update · delete · insert counts, collection and index lists |
| Bash | A terminal window: traffic lights and the description as its title, `$ command` highlighted, output, stderr in red |
| Read | A file header, "Read lines 10–60 of 400", a minimap of where in the file, line numbers and syntax colors, the lines read lit. **An image as the picture itself** (see below) |
| Write · Edit | An editor tab with a language badge, `+adds −dels`, a GitHub-dark diff (a new file as numbered content) |
| Grep · Glob | A search bar with the count, path/glob tags, matching lines with the pattern lit |
| WebFetch · WebSearch | An address bar with the status code, the prompt, the result |
| Agent | A subagent card (description · type · prompt) and its result |
| TodoWrite · TaskList · TaskCreate · TaskUpdate | A progress bar and a task board (status · owner · blocked by), state changes as `○ → ◐` |
| Skill | A skill badge, its arguments, the tools it allows |
| AskUserQuestion | The questions and options, the answer picked lit (typed answers too) |
| ExitPlanMode · EnterPlanMode | The plan as a document (headings · checklists · code), whether it was edited |
| ToolSearch | The query and the tools it loaded, by MCP server |
| LSP | The operation and its locations (`file:line:column`) |
| Monitor · ScheduleWakeup · Cron | A clock card: next run, recurring or not, the prompt |
| SendMessage · PushNotification | Who it goes to and the message as a bubble, whether it was sent |
| Workflow | A run card: name · status · run/task id · summary |
| MCP resources · Worktree | Resource lists and contents / the worktree's path and branch |
| Other MCP tools | `server · MCP`, INPUT as key/value rows, RESULT as a JSON tree, or as a document when it is markdown |

<table><tr>
<td><img src="../../images/tool-fold-panel-bash.png" alt="Bash detail" width="100%"></td>
<td><img src="../../images/tool-fold-panel-edit.png" alt="Edit detail" width="100%"></td>
</tr><tr>
<td><img src="../../images/tool-fold-panel-web.png" alt="WebSearch detail" width="100%"></td>
<td><img src="../../images/tool-fold-panel-ask.png" alt="AskUserQuestion detail" width="100%"></td>
</tr></table>

- Pick with a click or `↑` `↓`; scroll the detail with the wheel or its scrollbar. `Follow` in the toolbar keeps the newest call shown.
- With the panel up, a click on a line in the transcript shows that call in the panel instead of unfolding it there.
- Performance: large results are cut and kept in memory (only a light list in state), a detail is laid out once and reused, and only what is in view is drawn.

### Image preview

A Read of an image shows **the picture itself** in the detail (under a header of name · format · size · bytes, fitted to the
pane's width, its shape kept). Its transcript line reads `image · 2338×1506 · 324 KB`.

- A PNG is drawn from the file as it is; JPEG, GIF and WebP from a PNG copy made by macOS `sips` (else ImageMagick) under
  `$TMPDIR/tool-fold/`. No image bytes are held in memory.
- Pictures are drawn in the terminal panel on kitty, Ghostty and iTerm2 3.5+. In a terminal the engine does not know (inside a
  multiplexer such as herdr), add `"CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1"` to `env` in `~/.claude/settings.json` and restart;
  herdr also needs `[experimental] kitty_graphics = true` in its `config.toml`.
- Where none can be drawn: `▣ name · format · size` in its place, a note on desktop, or why a conversion failed.

## Unfolding

- **Click a line**: `▸` turns `▾` and the engine's own result block shows under it. Click again to fold it.
- The line under the pointer lights quietly.
- `/tools expand` unfolds every call; `/tools collapse` folds them all.
- Rows fold in verbose mode (`"verbose": true`) and in `ctrl+o`'s full transcript too; turn on `yieldExpanded` to leave
  those two to the engine.

## Install

```
/plugin install tool-fold --marketplace speardragon/ray-claude-code-mods
```

## Usage

| Input | Does |
| --- | --- |
| `/tools` | Toggles it (remembered across sessions) |
| `/tools on` · `/tools off` | Turns it on · off |
| `/tools panel` | Turns the tool panel on / off (`/tools panel on` · `off`) |
| `/tools expand` · `/tools collapse` | Unfolds · folds every call |
| `/tools stats` | How many rows were drawn folded this session, and why any were left to the engine |
| Click a line | Unfolds or folds that call |

## Options

| Key | Default | |
| --- | --- | --- |
| `yieldExpanded` | `false` | Where the engine shows calls in full (`ctrl+o`, verbose mode), draw them the engine's way |

## Good to know

- Clicks work in a terminal in the fullscreen layout; elsewhere use `/tools expand` and `ctrl+o`.
- Read sends an image over 2000px to the model shrunk to JPEG; the panel draws the original file.
- Runs of reads and searches the engine already folds into one line ("Read 3 files") are left as they are.
- Started from `tool-lines` in [Tickloop/claude-mods](https://github.com/Tickloop/claude-mods), made unfoldable, with a
  summary of each result.
