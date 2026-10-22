# 🗂️ diff-explorer

[한국어](README.md) · **English**

The files Claude changes in this session, in a VS Code-style panel beside the chat: a tree of just the changed files
on the left, the picked file's diff in GitHub dark on the right. "What did it just change?" answered without leaving
the terminal.

<img src="../../images/diff-explorer.png" alt="diff-explorer" width="100%">

## Features

- **A tree of the changed files**: Material Icon Theme-style icons and folder colors, VS Code's git status colors
  (`M` modified · `A` added · `D` deleted). A folder holding a lone folder folds into one row, like `src/hooks`.
- **GitHub-dark diffs**: old and new line numbers, added and removed backgrounds, and in a paired line only the
  characters that changed marked. Three lines of context and `⋯ N unchanged lines`.
- **One cumulative diff**: compared with the file as it was before Claude first touched it, however many edits
  followed. A file edited back to how it was stays, dimmed.
- **New and deleted files**: `NEW` and `DELETED` badges, and a strikethrough.
- **File view**: `v` swaps the diff for the whole file, syntax highlighted.
- **Scrolling**: the tree and the preview scroll apart; with wrap (`w`) off, a sideways scrollbar and `◀ ▶`.
- **Main agent and subagents alike**: picks up files changed by `Write`, `Edit`, `MultiEdit` and `NotebookEdit`.

## Install

```
/plugin install diff-explorer --marketplace speardragon/ray-claude-code-mods
```

## Usage

| Key | Click | Does |
| --- | --- | --- |
| `/diffs` | | Toggles the panel |
| `/diffs on` · `/diffs off` | | Opens · closes the panel |
| `/diffs clear` | | Forgets what was tracked (files as they are now become the baseline) |
| `t` | Toolbar `Explorer` | Shows or hides the explorer |
| `c` | Right of the explorer's title | Collapses or expands every folder |
| `p` / `n` | File header `‹` `›` | Previous / next file |
| `v` | Status row `Diff │ File` | Diff ↔ whole file |
| `w` | Status row `Wrap` | Wraps long lines, or not |
| `k` / `j` | Status row `▲` `▼` | A page up / down |
| `h` / `l` | Status row `◀` `▶` | Scrolls sideways (wrap off) |
| | A tree row | Picks a file, folds or unfolds a folder |
| Wheel · scrollbars | | The wheel scrolls the column under it; scrollbars drag and click |

Keys work once you click into the panel (toolbar, tree, header, status row or a scrollbar). Below 72 columns the
tree hides itself, and the file header's `‹` `›` and `n/total` walk the files.

## Options

Change them from the plugin's rows in `/config`.

| Key | Default | |
| --- | --- | --- |
| `icons` | `nerd` | `nerd`: Nerd Font glyph icons. `plain`: colored dots, any font |
| `autoOpen` | `true` | Opens the panel on the session's first change (only where it would dock beside the chat) |

## Good to know

- Files changed through `Bash` (`sed -i`, `rm`, …) are not tracked yet; a tracked file `Bash` deletes shows as `DELETED`.
- Past 1 MB a file shows a note instead of a diff; `v` still shows its contents.
- Claude Code does not pass the wheel's sideways motion to mods, so sideways scrolling is the scrollbar and `h` `l`.
