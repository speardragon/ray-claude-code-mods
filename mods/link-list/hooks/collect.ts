// A reply message's links as a group, and how groups merge: by row id, oldest first.
import type { Group, Link } from '../types'
import { linksOf } from './links'
import { parseBlocks } from './markdown'

type Block = { type?: string; text?: string }

// The text a reply message carries: its text blocks, as the transcript draws them, a blank line apart.
export function replyText(content: string | Block[] | undefined): string {
  if (typeof content === 'string') return content
  return (content ?? []).filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n\n')
}

export function groupOf(uuid: string, text: string, at: number): Group | null {
  const links = linksOf(parseBlocks(text))
  return links.length > 0 ? { uuid, at, links } : null
}

export function mergeGroups(a: Group[], b: Group[]): Group[] {
  const byId = new Map([...a, ...b].map(g => [g.uuid, g]))
  return [...byId.values()].sort((x, y) => x.at - y.at)
}

// A link's host, lower-cased, without `www.`: what its favicon is fetched for and its row shows.
export function hostOf(url: string): string {
  const m = url.match(/^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i)
  return (m?.[1] ?? '').toLowerCase().replace(/^www\./, '')
}

// What a row says for a link: its own words, or for a bare URL the host and path without the scheme.
export function labelOf(link: Link): string {
  if (link.text && link.text !== link.url) return link.text
  return link.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

export const keyOf = (group: Group, link: Link) => `${group.uuid}#${link.no}`
