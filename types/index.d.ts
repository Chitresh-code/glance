export type Files = { root: string; expanded: string[]; file: string | null; hidden: boolean; raw: boolean }

declare module 'claude-code' {
  interface PluginState {
    'glance': { root: string; expanded: string[]; file: string | null; hidden: boolean; raw: boolean }
  }
}
