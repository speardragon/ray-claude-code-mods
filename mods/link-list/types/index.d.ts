// One link of a reply, numbered as readability numbers it (links.ts).
export type Link = { url: string; text: string; no: number }

// The links of one reply message: the transcript row's id, when it was kept (ms), its links in order.
export type Group = { uuid: string; at: number; links: Link[] }

// A host's favicon: being fetched, a PNG to draw (a rounded tile, or the bare icon where none could
// be made), or why there is none (its letter badge stays).
export type Favicon = { state: 'loading' } | { state: 'ready'; png: string; isTile: boolean } | { state: 'none'; problem: string }

export type Locale = 'ko' | 'en'

declare module 'claude-code' {
  interface PluginState {
    'link-list': {
      groups: Group[]
      selected: string | null // `${uuid}#${no}`
      offset: number // the list window's first row
      favicons: Record<string, Favicon>
      isFetching: boolean // set once the pane has been opened: favicons are fetched from then on
      locale: Locale | null
      now: number
      tzOffset: number
      note: string
    }
  }
}
