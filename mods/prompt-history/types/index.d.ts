// One prompt the person sent: the transcript row's id, its text and when it was sent (ms).
export type Prompt = { uuid: string; text: string; at: number }

export type Locale = 'ko' | 'en'

// Where the list's and the preview's windows start; the preview's offset is for one prompt.
export type Scroll = { list: number; preview: number; previewFor: string | null }

declare module 'claude-code' {
  interface PluginState {
    'prompt-history': {
      prompts: Prompt[]
      selected: string | null
      scroll: Scroll
      locale: Locale | null
      now: number
      tzOffset: number
      note: string
    }
  }
}
