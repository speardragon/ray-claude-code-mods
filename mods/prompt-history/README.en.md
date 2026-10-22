# 💬 prompt-history

[한국어](README.md) · **English**

Just the prompts you sent this session, in a panel beside the chat. See when you sent each at a glance, read long
ones in full, and take the transcript back to one with a single press.

<img src="../../images/prompt-history-en.png" alt="prompt-history" width="100%">

## Features

- **Grouped by day**: under `Today` · `Yesterday` · `Oct 20 (Mon)`, each prompt's number and first line (line breaks as `↵`).
- **Relative times**: `just now` → `3m ago` → `2h ago` → `3d ago`, and `Oct 12` once a week has passed. Refreshed
  every 30 seconds; however long the time reads, the prompt's text gives way so the time always shows whole.
- **The full text**: the picked prompt on the right as written, wrapped at words. Scroll with the wheel, the
  scrollbar or `↑` `↓`.
- **Copy**: `[ ⧉ Copy ]` puts the picked prompt's full text on the clipboard, to send again or paste elsewhere.
- **Jump back**: `[ ↗ Jump ]` or `/prompts <n>` scrolls the transcript to that prompt.
- **Earlier prompts too**: on load it reads what you already sent from the session's transcript, then adds each new
  prompt as you send it. Slash commands, their output and the engine's own messages are left out; `/clear` empties it.
- **English / 한국어**: `한국어 │ EN` in the toolbar switches how times read.

## Install

```
/plugin install prompt-history --marketplace speardragon/ray-claude-code-mods
```

## Usage

| Input | Does |
| --- | --- |
| `/prompts` | Toggles the panel. Opening it gives it the keys, so `↑` `↓` pick right away |
| `/prompts on` · `/prompts off` | Opens · closes the panel |
| `/prompts 3` | Jumps straight to the third prompt |
| `↑` `↓` | (panel focused) Picks a prompt; `PageUp` `PageDown` several at a time, `Home` `End` the first / last |
| `Enter` | (panel focused) Takes the transcript to the picked prompt |
| Click a list row | Picks that prompt and shows it in full |
| `[ ⧉ Copy ]` | Copies the picked prompt's full text to the clipboard |
| `[ ↗ Jump ]` | Takes the transcript to the picked prompt |
| Status row `▲` `▼` | A page up / down in the full text |
| Wheel · scrollbars | The wheel scrolls the column under it |

## Focus: the panel and the prompt

Keys go to one place at a time: the prompt, or the panel.

| To | Do |
| --- | --- |
| Move to the panel | Automatic when `/prompts` opens it; or `ctrl+x tab`; or click one of its buttons |
| Go back to the prompt | `Esc` (the panel stays open) |
| Close the panel | `/prompts` again, `/prompts off`, or `ctrl+x x` |

With the panel focused, `↑` `↓` move through the list and `Enter` presses Jump. With the prompt focused, keys type as
usual and `↑` walks your prompt history.

## Options

| Key | Default | |
| --- | --- | --- |
| `locale` | `ko` | `ko` (`3분 전`, `10월 22일`, `오후 2:31`) or `en` (`3m ago`, `Oct 22`, `2:31 PM`); the toolbar switches it for the session |

## Good to know

- Claude Code moves the transcript only in answer to your own input (a button, a command you typed). The list rows
  draw their own hover, so a click on one picks it without jumping; `[ ↗ Jump ]` and `/prompts <n>` jump.
- Times follow the system's time zone (`date +%z`).
