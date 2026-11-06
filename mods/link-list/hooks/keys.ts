// The pane's keys arrive as the engine's own scroll of the pane (the arrows a row, a page key a
// window, Home and End the whole tree), with no pointer. The pane keeps its window still and reads
// each as a move through the list instead: this is how far.
export const END = 1_000_000

export function keyStep(by: number, bodyRows: number, contentRows: number, page: number): number {
  if (by === 0) return 0
  const sign = Math.sign(by)
  if (Math.abs(by) >= contentRows) return sign * END // Home, End
  if (bodyRows > 1 && Math.abs(by) >= bodyRows) return sign * Math.max(1, page) // Page Up, Page Down
  return sign // an arrow
}
