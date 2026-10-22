// The values this mod keeps in $.state, by key. Every key the hooks module names is checked against this.
export type Count = number

declare module 'claude-code' {
  interface PluginState {
    '__MOD__': {
      count: Count
    }
  }
}
