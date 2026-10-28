# 📖 readability

[한국어](README.md) · **English**

Claude's replies drawn for reading: crisp white body text, headings made big with `#` marks and rules, inline code
and links that stand out, code blocks in a frame with syntax colors, tables with bright borders, lines kept to 100
columns by default. Replies look the same **while
they stream**, and nothing jumps when they finish.

<img src="../../images/readability.png" alt="readability" width="100%">

## Why

It fixes the two things that bothered me about [glamour-dark](https://github.com/Tickloop/claude-mods).

| Problem | readability |
| --- | --- |
| A line per sentence and margins above and below make replies busier, not easier | Keeps **the engine's own flow** (indent, one blank line between blocks, wrapping) and adds only color and emphasis |
| The reply switches to a different layout all at once when it ends: a visible jolt | Draws unfinished markdown safely (an unclosed fence, half a table), so styling applies **as soon as it is drawn**, and lines stay put when the drawing switches |

## Features

- **Body**: crisp white (`#f0f6fc`), wrapping at words (anywhere in Hangul and CJK), brighter bold, italic, strikethrough
- **Headings**: a terminal has one type size, so a heading carries its level in `#`s, H1 a heavy rule across the width
  and H2 a light one under its text, marks and rules in the heading's own color
- **Inline code · links**: orange on a faint background / blue and underlined (clickable)
- **Code blocks**: a rounded frame with the language in its top edge, a background panel, syntax colors (TS/JS, Python,
  Go, Rust, shell, JSON, YAML…)
- **Tables**: bright borders, a bold header on blue over a double rule, alignment (`:---:`), cells wrapped to fit; emoji like `✅` count two cells so
  columns stay aligned
- **Lists**: `•` colored by depth, aligned numbers, `☐` `☑` checkboxes, hanging indents
- **Quotes**: a blue `▌` bar, the whole line on a faint tint, clear text

## Install

```
/plugin install readability --marketplace speardragon/ray-claude-code-mods
```

## Usage

| Input | Does |
| --- | --- |
| `/readability` | Toggles it (remembered for later sessions) |
| `/readability on` · `/readability off` | Turns it on · off |
| `/readability stats` | How often replies were drawn this session, and whether while streaming |

## Options

| Key | Default | |
| --- | --- | --- |
| `maxColumns` | `100` | The widest a reply's lines get. `0` is the terminal's full width |

## Good to know

- Terminal only; the desktop app and VS Code keep the engine's drawing.
- Whether the engine lets a mod draw a reply while it streams can depend on the Claude Code version; `/readability
  stats` tells. Where it draws only whole replies (as on 2.1.311), the styling arrives then; with `maxColumns` at `0` the
  wrapping matches the engine's too, so lines barely move at the switch.
- Summary rows (`· summary`) keep the engine's drawing, to keep its mark.
