// Subsequence match, VS Code Ctrl+P style: every query character must appear in order.
// Runs of adjacent hits, hits in the file name and hits at a word start score higher; null means no match.
export const fuzzy = (query: string, path: string): number | null => {
  const t = path.toLowerCase()
  const base = t.lastIndexOf('/') + 1
  let score = 0
  let at = 0
  let prev = -2
  for (const ch of query.toLowerCase()) {
    if (ch === ' ') continue
    const i = t.indexOf(ch, at)
    if (i < 0) return null
    score += 1 + (i === prev + 1 ? 5 : 0) + (i >= base ? 2 : 0) + (i === 0 || '/._-'.includes(t[i - 1]!) ? 3 : 0)
    prev = i
    at = i + 1
  }
  return score - t.length / 100
}
