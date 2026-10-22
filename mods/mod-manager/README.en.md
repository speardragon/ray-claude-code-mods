# 🧩 mod-manager

[한국어](README.md) · **English**

Manage your installed Claude Code mods from one panel: see what you have, read their READMEs, switch them on and off
one by one, and open each mod's panel with a button.

<img src="../../images/mod-manager-en.png" alt="mod-manager" width="100%">

## Features

- **Browse**: grouped by marketplace; `●` on / `○` off, the version, and an `ON` `OFF` switch at the row's end.
- **Details**: the picked mod's version, marketplace, install scope, description, and its README (headings, lists and
  code blocks styled, scrollable).
- **Switch on and off**: a switch runs `claude plugin enable|disable`. Where a plugin is installed at several scopes,
  it changes the one that applies to this project (local › project › user). `⟳ Reload` in the status row applies it.
- **Open panels**: a mod's slash commands show as buttons like `/diffs`; press one to open that mod's panel.
- **Mods / All**: by default just the plugins with a hooks module; `All` adds skill, MCP and LSP plugins.
- **Guard rails**: no switch on mod-manager itself (`this`) or on mods this session is developing (`dev`): turning
  those off would leave no way back from here.

## Install

```
/plugin install mod-manager --marketplace speardragon/ray-claude-code-mods
```

## Usage

| Input | Does |
| --- | --- |
| `/mods` | Opens the panel (reads the installed plugins afresh each time) |
| `/mods refresh` | Reads the installed plugins again |
| Click a list row | Shows that mod's details |
| A row's `ON` / `OFF`, or `● Enabled` in the details | Switches it on or off |
| A `/command` button in the details | Runs that command (opens the mod's panel) |
| Toolbar `Mods │ All` · `⟳ Refresh` | Switches the filter · reads again |
| Status row `⟳ Reload` | Applies the changes with `/reload-plugins` |
| Click the list, then `↑` `↓` | Walks the mods; `Space` switches, `Enter` runs the first command |
| Wheel · scrollbars | The wheel scrolls the column under it (list or README) |

## Good to know

- A switch takes hold after `/reload-plugins`. If `⟳ Reload` is refused, type it yourself as the status row says.
- A panel opened from a command button answers a command the mod ran, not one you typed, so in a narrow terminal
  (under 144 columns, or 110 for a panel you have opened before) it may not take its seat right away. Type the
  command yourself then.
- The list is read from `claude plugin list --json`; the first open can take a second or two.
