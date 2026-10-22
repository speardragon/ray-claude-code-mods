// Screenshots of diff-explorer on a demo change set (scripts/shots/render.mjs).
import { test } from 'claude-code/testing'

type Node = { type?: string; props?: { key?: string }; children?: unknown[] }

async function shoot(ui: { drawn: (scope?: { in: string }) => Promise<unknown> }, meta: Record<string, unknown>) {
  const tree = await ui.drawn()
  const keys: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as Node
    if (node.type === 'Client' && node.props?.key) keys.push(node.props.key)
    node.children?.forEach(walk)
  }
  walk(tree)
  const clients: Record<string, unknown> = {}
  for (const key of keys) clients[key] = await ui.drawn({ in: key })
  throw new Error(`@@SHOT@@${JSON.stringify({ ...meta, tree, clients })}@@END@@`)
}

const SIDEBAR_BEFORE = `import { useState } from 'react'
import { NavLink } from './NavLink'
import styles from './Sidebar.module.scss'

type Props = { items: { href: string; label: string }[] }

export function Sidebar({ items }: Props) {
  const [active, setActive] = useState(items[0]?.href)

  return (
    <aside className={styles.sidebar}>
      <nav>
        {items.map(item => (
          <NavLink key={item.href} {...item} isActive={item.href === active} onSelect={setActive} />
        ))}
      </nav>
    </aside>
  )
}
`

const SIDEBAR_AFTER = `import { useRef, useState } from 'react'
import { NavLink } from './NavLink'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useMediaQuery } from '../hooks/useMediaQuery'
import styles from './Sidebar.module.scss'

type Props = { items: { href: string; label: string }[] }

export function Sidebar({ items }: Props) {
  const [active, setActive] = useState(items[0]?.href)
  const [isOpen, setOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const panel = useRef<HTMLElement>(null)
  useFocusTrap(panel, isMobile && isOpen, () => setOpen(false))

  return (
    <aside ref={panel} className={isMobile ? styles.drawer : styles.sidebar} aria-expanded={isOpen}>
      <nav>
        {items.map(item => (
          <NavLink key={item.href} {...item} isActive={item.href === active} onSelect={setActive} />
        ))}
      </nav>
    </aside>
  )
}
`

const FILES: [string, string | null, string | null][] = [
  ['/repo/src/components/Sidebar.tsx', SIDEBAR_BEFORE, SIDEBAR_AFTER],
  ['/repo/src/hooks/useFocusTrap.ts', null, `import { useEffect } from 'react'\n\n// Keeps Tab inside \`ref\` while \`isOn\`; Esc calls \`onClose\`.\nexport function useFocusTrap(ref: React.RefObject<HTMLElement>, isOn: boolean, onClose: () => void) {\n  useEffect(() => {\n    if (!isOn) return\n    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()\n    document.addEventListener('keydown', onKey)\n    return () => document.removeEventListener('keydown', onKey)\n  }, [isOn, onClose])\n}\n`],
  ['/repo/src/hooks/useMediaQuery.ts', null, `import { useSyncExternalStore } from 'react'\n\nexport const useMediaQuery = (query: string) =>\n  useSyncExternalStore(\n    cb => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },\n    () => matchMedia(query).matches,\n  )\n`],
  ['/repo/src/components/Sidebar.module.scss', `.sidebar {\n  width: 240px;\n  border-right: 1px solid var(--border);\n}\n`, `.sidebar {\n  width: 240px;\n  border-right: 1px solid var(--border);\n}\n\n.drawer {\n  position: fixed;\n  inset: 0 auto 0 0;\n  width: 80vw;\n  transition: transform 150ms ease-out;\n}\n`],
  ['/repo/src/app/layout.tsx', `export default function Layout({ children }) {\n  return <body>{children}</body>\n}\n`, `export default function Layout({ children }) {\n  return <body className="app">{children}</body>\n}\n`],
  ['/repo/package.json', `{\n  "name": "acme-web",\n  "version": "1.3.0"\n}\n`, `{\n  "name": "acme-web",\n  "version": "1.4.0"\n}\n`],
  ['/repo/docs/guide.md', `# 가이드\n\n사이드바는 항상 열려 있습니다.\n`, `# 가이드\n\n사이드바는 768px 아래에서 드로어로 접힙니다.\n`],
  ['/repo/tests/sidebar.test.tsx', null, `import { render } from '@testing-library/react'\n\ntest('the drawer closes on Escape', () => {})\n`],
  ['/repo/src/legacy/MobileMenu.js', `export default function MobileMenu() {}\n`, `export default function MobileMenu() {}\n`],
]

const TRANSCRIPT = [
  ['prompt', 'On mobile the sidebar covers the whole screen. Fold it into a'],
  ['prompt', 'drawer below 768px, and drop the old MobileMenu.'],
  ['blank', ''],
  ['bullet', "I'll turn the sidebar into a drawer and remove MobileMenu."],
  ['blank', ''],
  ['tool', 'Update(src/components/Sidebar.tsx)'],
  ['out', 'Updated with 8 additions and 2 removals'],
  ['tool', 'Write(src/hooks/useFocusTrap.ts)'],
  ['out', 'Wrote 11 lines'],
  ['tool', 'Write(src/hooks/useMediaQuery.ts)'],
  ['out', 'Wrote 7 lines'],
  ['tool', 'Update(src/components/Sidebar.module.scss)'],
  ['out', 'Updated with 7 additions'],
  ['tool', 'Bash(rm src/legacy/MobileMenu.js)'],
  ['out', '(No output)'],
  ['tool', 'Write(tests/sidebar.test.tsx)'],
  ['out', 'Wrote 3 lines'],
  ['blank', ''],
  ['bullet', 'Below 768px the sidebar is now a drawer that traps focus and'],
  ['bullet', 'closes on Esc. MobileMenu is gone.'],
]

const WIDTH = 118
const HEIGHT = 32

test('diff-explorer', async ($, on) => {
  const disk = new Map<string, string>()
  for (const [path, before] of FILES) if (before !== null) disk.set(path, before)
  on('command.register', () => ({ value: { command: 'diffs' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', (_, e) => {
    const text = disk.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    const input = e as unknown as { file_path: string; content: string }
    disk.set(input.file_path, input.content)
    return { result: {} }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const call = $.tool.call as unknown as (e: { tool: string; file_path: string; content: string }) => Promise<unknown>
  for (const [path, , after] of FILES) await call({ tool: 'Write', file_path: path, content: after ?? '' })
  disk.delete('/repo/src/legacy/MobileMenu.js')

  const ui = await $.ui.mount({
    plugin: 'diff-explorer',
    component: 'Pane',
    requestId: 'diff-explorer',
    surface: 'terminal',
    props: { title: 'Changes', isFocused: true, bodyColumns: WIDTH, placement: 'dock', scroll: { offset: 0, bodyRows: HEIGHT }, view: {} },
  })
  await ui.post({ type: 'pick', key: '/repo/src/components/Sidebar.tsx' }, { in: 'explorer' })
  await ui.pointer({ type: 'move', x: 6, y: 10, in: 'explorer' })
  await shoot(ui, { name: 'diff-explorer', width: WIDTH, height: HEIGHT, title: 'claude — ~/acme-web', transcript: TRANSCRIPT, transcriptColumns: 66 })
})
