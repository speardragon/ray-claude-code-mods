// The changed files as a VS Code explorer tree: folders first, chains of lone folders compacted
// into one row (`src/hooks`), each folder open unless the person collapsed it.

export type TreeRow =
  | { kind: 'dir'; key: string; name: string; depth: number; isOpen: boolean }
  | { kind: 'file'; key: string; name: string; depth: number; path: string }

type Node = { name: string; key: string; dirs: Map<string, Node>; files: { name: string; path: string }[] }

const node = (name: string, key: string): Node => ({ name, key, dirs: new Map(), files: [] })

// The path as the tree shows it: under the session's folder, under home as `~`, else from the root.
export function relative(path: string, cwd: string, home: string): string {
  const under = (root: string) => root && path.startsWith(root.replace(/\/$/, '') + '/')
  if (under(cwd)) return path.slice(cwd.replace(/\/$/, '').length + 1)
  if (under(home)) return '~/' + path.slice(home.replace(/\/$/, '').length + 1)
  return path.replace(/^\/+/, '')
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export function buildTree(entries: { rel: string; path: string }[]): Node {
  const root = node('', '')
  for (const { rel, path } of entries) {
    const parts = rel.split('/').filter(Boolean)
    const name = parts.pop() ?? rel
    let at = root
    for (const part of parts) {
      const key = at.key ? `${at.key}/${part}` : part
      if (!at.dirs.has(part)) at.dirs.set(part, node(part, key))
      at = at.dirs.get(part)!
    }
    at.files.push({ name, path })
  }
  return root
}

// A folder holding one folder and no files takes its child's place, named `a/b`.
function compact(dir: Node): Node {
  let at = dir
  let name = dir.name
  while (at.files.length === 0 && at.dirs.size === 1) {
    const [only] = at.dirs.values()
    at = only!
    name = `${name}/${at.name}`
  }
  return at === dir ? dir : { ...at, name }
}

export function treeRows(root: Node, collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (dir: Node, depth: number) => {
    for (const child of [...dir.dirs.values()].map(compact).sort(byName)) {
      const isOpen = !collapsed.has(child.key)
      rows.push({ kind: 'dir', key: child.key, name: child.name, depth, isOpen })
      if (isOpen) walk(child, depth + 1)
    }
    for (const file of [...dir.files].sort(byName)) {
      rows.push({ kind: 'file', key: file.path, name: file.name, depth, path: file.path })
    }
  }
  walk(root, 0)
  return rows
}

// The files in the order the tree lists them, collapsed folders included: what next and previous walk.
export function fileOrder(root: Node): string[] {
  return treeRows(root, new Set()).flatMap(row => (row.kind === 'file' ? [row.path] : []))
}
