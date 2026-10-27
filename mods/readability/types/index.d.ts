// Whether replies are drawn by the mod (true) or left to the engine.
export type Enabled = boolean

declare module 'claude-code' {
  interface PluginState {
    'readability': {
      enabled: Enabled
    }
  }
}
