// Whether two plain values hold the same thing, so an unchanged reading is not written again.
export const isSame = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
