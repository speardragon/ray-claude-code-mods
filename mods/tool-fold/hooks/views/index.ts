// The detail of one call: the view that suits its tool, MongoDB's Compass view for a MongoDB MCP
// call, and the generic one for the rest.
import type { Line } from './kit'
import { mongoView } from './mongo'
import { toolView } from './tools'
import type { ViewInput } from './tools'

export type { Line, Span } from './kit'
export { mongoOp } from './mongo'

export function detailRows(v: ViewInput): Line[] {
  return mongoView(v.tool, v.input, v.text, v.state === 'error', v.width) ?? toolView(v)
}
