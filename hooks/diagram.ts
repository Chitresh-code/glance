import { renderMermaidASCII } from './vendor/mermaid.js'

// Tight spacing and no blank rows inside boxes: a pane is narrow, and the defaults make each box six rows tall.
const OPTIONS = [
  { paddingX: 2, paddingY: 1, boxBorderPadding: 0 },
  { paddingX: 1, paddingY: 1, boxBorderPadding: 0 },
]
export type Art = { text: string; width: number; height: number }
const cache = new Map<string, Art[] | Error>()

// Every way the diagram can be drawn: as written, and top-down when it was written left-to-right.
export const layouts = (src: string): Art[] | Error => {
  const hit = cache.get(src)
  if (hit) return hit
  const sources = [src]
  const flipped = src.replace(/^(\s*(?:flowchart|graph)\s+)(LR|RL)\b/m, '$1TD')
  if (flipped !== src) sources.push(flipped)
  const arts: Art[] = []
  let error: Error | undefined
  for (const s of sources)
    for (const o of OPTIONS) {
      try {
        const lines = renderMermaidASCII(s, { colorMode: 'none', ...o }).split('\n').map(l => l.trimEnd())
        while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
        arts.push({ text: lines.join('\n'), width: Math.max(0, ...lines.map(l => l.length)), height: lines.length })
      } catch (err) {
        error ??= err instanceof Error ? err : new Error(String(err))
      }
    }
  const out = arts.length > 0 ? arts : error ?? new Error('nothing to draw')
  if (cache.size > 200) cache.clear()
  cache.set(src, out)
  return out
}

// The first layout that fits, in the order written; when none does, the narrowest, which the pane pans across.
export const pick = (arts: Art[], width: number) =>
  arts.find(a => a.width <= width) ?? arts.reduce((a, b) => (b.width < a.width ? b : a))

const CARD: Record<string, string> = { '||': '1', '|o': '0..1', 'o|': '0..1', '}o': '0..n', 'o{': '0..n', '}|': '1..n', '|{': '1..n' }
export type Relation = { from: string; to: string; label: string; card: string }

// ER diagrams draw scrambled as text art, so they are shown as a list of relationships instead.
export const relations = (src: string): Relation[] | null => {
  if (!/^\s*erDiagram\b/m.test(src)) return null
  const out: Relation[] = []
  for (const m of src.matchAll(/^\s*([\w-]+)\s+([|}o]{2})(?:--|\.\.)([|{o]{2})\s+([\w-]+)\s*:\s*"?([^"\n]*?)"?\s*$/gm))
    out.push({ from: m[1]!, to: m[4]!, label: m[5]!, card: `${CARD[m[2]!] ?? '?'} → ${CARD[m[3]!] ?? '?'}` })
  return out
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// A page that draws the diagrams with Mermaid itself, for when text art is too cramped; follows the system light or dark mode.
export const page = (title: string, sources: string[]) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root { color-scheme: light dark; --bg: #faf9f5; --fg: #1f1e1d; --rule: #e0ddd4 }
@media (prefers-color-scheme: dark) { :root { --bg: #1f1e1d; --fg: #eeece2; --rule: #3a3936 } }
body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif }
h1 { font-size: 16px; font-weight: 600; margin: 0 auto 16px; max-width: 1200px }
section { max-width: 1200px; margin: 0 auto 32px; padding-bottom: 32px; border-bottom: 1px solid var(--rule); overflow-x: auto }
.mermaid { display: flex; justify-content: center }
</style></head><body>
<h1>${escape(title)}</h1>
${sources.map(s => `<section><pre class="mermaid">${escape(s)}</pre></section>`).join('\n')}
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs'
const dark = matchMedia('(prefers-color-scheme: dark)').matches
mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict' })
await mermaid.run()
</script>
</body></html>
`
