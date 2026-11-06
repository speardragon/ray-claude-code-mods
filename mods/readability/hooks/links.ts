// The links of one reply, numbered as they are read: block by block, a list item's blocks in turn,
// a table's header cells and then its rows. A URL seen before in the same reply keeps its number.
// readability and link-list both keep this file, byte for byte, so the number after a link in a
// reply is the number the link-list pane shows for it.
import type { Block, Inline } from './markdown'

export type Link = { url: string; text: string; no: number }

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

export const superscript = (n: number) => [...String(n)].map(d => SUPERSCRIPT[Number(d)]).join('')

function textOf(inline: Inline[]): string {
  return inline
    .map(node => (node.kind === 'text' || node.kind === 'code' ? node.text : textOf(node.children)))
    .join('')
}

function inlineLinks(inline: Inline[]): { url: string; text: string }[] {
  return inline.flatMap(node => {
    if (node.kind === 'link') return [{ url: node.href, text: textOf(node.children).trim() }]
    if (node.kind === 'text' || node.kind === 'code') return []
    return inlineLinks(node.children)
  })
}

function blockLinks(block: Block): { url: string; text: string }[] {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return inlineLinks(block.inline)
    case 'quote':
      return block.blocks.flatMap(blockLinks)
    case 'list':
      return block.items.flatMap(item => item.blocks.flatMap(blockLinks))
    case 'table':
      return [...block.head, ...block.rows.flat()].flatMap(inlineLinks)
    case 'code':
    case 'rule':
      return []
  }
}

export function linksOf(blocks: Block[]): Link[] {
  const seen = new Map<string, number>()
  const out: Link[] = []
  for (const found of blocks.flatMap(blockLinks)) {
    if (!/^https?:\/\//i.test(found.url) || seen.has(found.url)) continue
    seen.set(found.url, seen.size + 1)
    out.push({ ...found, no: seen.size })
  }
  return out
}

// What a reply's links are numbered by: the URL to its number.
export const numbersOf = (links: Link[]) => new Map(links.map(l => [l.url, l.no]))
