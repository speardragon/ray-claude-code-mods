# ray-claude-code-mods

Claude Code mods (function-hook plugins) collection. Each mod lives in `mods/<name>/` and is listed in
`.claude-plugin/marketplace.json`, which makes this repo a plugin marketplace.

## Working on a mod

- Load the `plugin-authoring` skill before writing or changing mod code: it lays this build's API types
  (`claude-code` module) and examples. The declaration file is the authority; grep it for event names.
- New mod: `node scripts/new-mod.mjs <name> "<description>"` (copies `templates/mod`, registers it).
- Check: `./scripts/check.sh [name]` runs `claude plugin validate` and `claude plugin test`.
  Type-check with `tsc -p mods/<name>` once the engine has laid `.claude-plugin/types/` (gitignored).
- Changing a mod: bump `version` in both its `plugin.json` and `.claude-plugin/marketplace.json`, and keep
  the README table in sync.

## Conventions

- One hooks module per mod (`hooks/register.tsx`), helpers split into small files beside it.
- Values a drawing reads live in `$.state` atoms declared in `types/index.d.ts`; module variables reset on reload.
- Never name anything `h` or `Fragment` in a `.tsx` file: JSX compiles against the global `h`.
- Tests mount panes on both `terminal` and `desktop` surfaces.
- Docs for people (READMEs) are in Korean; code and comments in English.
