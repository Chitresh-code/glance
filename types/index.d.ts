export type Edit = { path: string; patch: string }

declare module 'claude-code' {
  interface PluginState {
    'glance': {
      root: string
      expanded: string[]
      file: string | null
      hidden: boolean
      raw: boolean
      edits: { path: string; patch: string }[]
      follow: boolean
      diff: boolean
      query: string | null
    }
  }
}
