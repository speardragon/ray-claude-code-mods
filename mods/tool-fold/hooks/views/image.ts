// A Read of an image: the file's head, then the picture itself where the terminal can draw one. The
// rows it covers are placeholders (its alt text) so the detail scrolls as any other; the panel lays
// the Image over them when the whole block is in view, and the terminal draws the alt where it cannot.
import type { ImageFacts } from '../calls'
import type { Line } from './kit'
import { P, blank, kb, s, spread, textRows } from './kit'

export type ImagePlace = { at: number; columns: number; rows: number; file: string; alt: string }
export type Detail = { rows: Line[]; image?: ImagePlace }

const MAX_CELLS = 255 // an Image's columns and rows, each
const CELL_ASPECT = 2 // a cell is about twice as tall as it is wide

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function imageFacts(image: ImageFacts): string {
  const size = image.width && image.height ? `${image.width}×${image.height}` : ''
  return [image.format, size, image.bytes !== undefined ? kb(image.bytes) : ''].filter(Boolean).join(' · ')
}

// The box the picture fills: as wide as the detail allows, as tall as its shape asks, both capped.
function boxOf(image: ImageFacts, width: number, height: number) {
  const ratio = image.width && image.height ? image.height / image.width : 0.6
  let columns = Math.min(MAX_CELLS, width, image.width ? Math.ceil(image.width / 8) : width)
  let rows = Math.max(1, Math.round((columns * ratio) / CELL_ASPECT))
  if (rows > height) {
    rows = height
    columns = Math.max(1, Math.min(columns, Math.round((rows * CELL_ASPECT) / ratio)))
  }
  return { columns: Math.max(1, columns), rows: Math.min(MAX_CELLS, rows) }
}

// `canDraw` is false where the surface has no Image element; the view is then text only.
export function imageDetail(image: ImageFacts, state: string, width: number, height: number, canDraw: boolean): Detail {
  const name = base(image.path)
  const rows: Line[] = [
    spread([s('▣ ', { color: P.violet }), s(name, { color: P.fg, weight: 'bold' })], [s(imageFacts(image), { color: P.subtle })], width),
    [s(image.path, { color: P.subtle })],
    blank(),
  ]
  const note = (text: string, color: string = P.muted) => rows.push(...textRows(text, width, { color, italic: true }))
  if (!canDraw) {
    note('Pictures are drawn in the terminal panel only.')
    return { rows }
  }
  if (!image.png) {
    note(image.problem ?? (state === 'running' ? 'Reading…' : 'Preparing the picture…'), image.problem ? P.warn : P.muted)
    return { rows }
  }
  // The picture takes what the detail shows, less the three rows above it and one below.
  const box = boxOf(image, width, Math.max(3, height - 4))
  const alt = `▣ ${name} · ${imageFacts(image)}`
  const at = rows.length
  for (let i = 0; i < box.rows; i++) rows.push(i === Math.floor((box.rows - 1) / 2) ? [s(alt, { color: P.faint, italic: true })] : blank())
  rows.push(blank())
  note('Shown where the terminal draws pictures (kitty, Ghostty, iTerm2 3.5+); elsewhere its name stands in.', P.faint)
  return { rows, image: { at, columns: box.columns, rows: box.rows, file: image.png, alt } }
}
