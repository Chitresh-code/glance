import { atom, read, update } from 'claude-code'
import type { Register, FsEntry, Color, Hook } from 'claude-code'
import { layouts, pick, relations } from './diagram'
import { fuzzy } from './fuzzy'

const PANE = 'files'
const MAX_LINES = 3000
const MAX_ROWS = 1500
const root = atom({ plugin: 'glance', key: 'root' } as const, '.')
const expanded = atom({ plugin: 'glance', key: 'expanded' } as const, [] as string[])
const file = atom({ plugin: 'glance', key: 'file' } as const, null as string | null)
const hidden = atom({ plugin: 'glance', key: 'hidden' } as const, false)
const raw = atom({ plugin: 'glance', key: 'raw' } as const, false)
// Files Claude changed this session, newest first, each with its latest edit as unified-diff hunks.
const edits = atom({ plugin: 'glance', key: 'edits' } as const, [] as { path: string; patch: string }[])
const follow = atom({ plugin: 'glance', key: 'follow' } as const, true)
const diff = atom({ plugin: 'glance', key: 'diff' } as const, false)
// null while not searching; the text typed in the find box otherwise.
const query = atom({ plugin: 'glance', key: 'query' } as const, null as string | null)
// How far a diagram wider than the pane is panned, in columns, for the file it was panned in.
const pan = atom({ plugin: 'glance', key: 'pan' } as const, { path: '', x: 0 })
const MAX_EDITS = 50
const MAX_INDEX = 20000
const MAX_RESULTS = 40
// Folders a project search never walks: build output and package caches swamp the results.
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.cache', 'coverage'])
// One drawing holds at most 100000 characters, so longer files are cut below that.
const MAX_CHARS = 90000

const join = (a: string, b: string) => (a === '.' ? b : `${a}/${b}`)
// Pops a segment, or climbs above the working directory with "..".
const up = (p: string) => {
  if (p === '.') return '..'
  const parts = p.split('/')
  if (parts[parts.length - 1] === '..') return `${p}/..`
  return parts.length === 1 ? '.' : parts.slice(0, -1).join('/')
}
const ext = (p: string) => (p.includes('.') ? p.split('.').pop()!.toLowerCase() : '')
const size = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
const fit = (s: string, w: number) => (s.length <= w ? s : `…${s.slice(s.length - w + 1)}`)
// Theme keys, not raw colors, so the pane follows the person's Claude Code theme (light, dark, custom).
const COLORS: Record<string, Color> = {
  ts: 'permission', tsx: 'permission', js: 'warning', jsx: 'warning', mjs: 'warning', py: 'success', rs: 'error',
  go: 'suggestion', md: 'remember', json: 'warning', yml: 'merged', yaml: 'merged', toml: 'merged', html: 'error',
  css: 'suggestion', sh: 'success', sql: 'suggestion', lock: 'inactive',
}
// Emoji, not Nerd Font glyphs: they draw in any terminal font without setup.
const BY_NAME: Record<string, string> = {
  'package.json': '📦', 'package-lock.json': '🔒', 'yarn.lock': '🔒', 'pnpm-lock.yaml': '🔒', 'uv.lock': '🔒',
  dockerfile: '🐳', 'docker-compose.yml': '🐳', makefile: '🔨', '.gitignore': '🙈', '.env': '🔑', license: '📜',
  'readme.md': '📖', 'claude.md': '🟠', 'agents.md': '🤖', 'changelog.md': '📰',
}
const BY_EXT: Record<string, string> = {
  ts: '🔷', tsx: '🌀', js: '🟨', jsx: '🌀', mjs: '🟨', cjs: '🟨', py: '🐍', rs: '🦀', go: '🐹', rb: '💎', java: '☕',
  kt: '🟣', swift: '🐦', c: '🔵', cpp: '🔵', h: '🔵', cs: '🟪', php: '🐘', lua: '🌙', md: '📝', mdx: '📝', mmd: '🧜', mermaid: '🧜', txt: '📄',
  json: '🧾', yml: '🧾', yaml: '🧾', toml: '🧾', ini: '🧾', xml: '🧾', html: '🌐', css: '🎨', scss: '🎨', svg: '🎨',
  png: '🌄', jpg: '🌄', jpeg: '🌄', gif: '🌄', webp: '🌄', ico: '🌄', pdf: '📕', zip: '📦', gz: '📦', tar: '📦',
  sh: '🐚', zsh: '🐚', bash: '🐚', sql: '💾', db: '💾', sqlite: '💾', lock: '🔒', log: '📃', env: '🔑', csv: '📊',
  test: '🧪', ipynb: '📓', vue: '💚', svelte: '🧡', dart: '🎯', ex: '💧', exs: '💧', hs: '🟪', zig: '⚡',
}
const icon = (name: string, isDir: boolean, isOpen: boolean) => {
  if (isDir) return isOpen ? '📂' : '📁'
  const n = name.toLowerCase()
  if (BY_NAME[n]) return BY_NAME[n]
  if (/\.(test|spec)\.[a-z]+$/.test(n)) return '🧪'
  if (n.startsWith('.env')) return '🔑'
  return BY_EXT[ext(n)] ?? '📄'
}
const isMarkdown = (p: string) => ['md', 'mdx', 'markdown'].includes(ext(p))
const isMermaid = (p: string) => ['mmd', 'mermaid'].includes(ext(p))
// Markdown split into prose and ```mermaid fences, so each fence can be drawn as a diagram.
const FENCE = /^```mermaid[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
const splitMermaid = (md: string) => {
  const parts: { kind: 'md' | 'mermaid'; text: string }[] = []
  let at = 0
  for (const m of md.matchAll(FENCE)) {
    if (m.index > at) parts.push({ kind: 'md', text: md.slice(at, m.index) })
    parts.push({ kind: 'mermaid', text: m[1] ?? '' })
    at = m.index + m[0].length
  }
  if (at < md.length) parts.push({ kind: 'md', text: md.slice(at) })
  return parts
}

type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }
// shortcut: shows only the latest edit to a file, not everything since the session began; keep the first originalFile and diff against it if that is wanted.
const toPatch = (hunks: readonly Hunk[]) => {
  let out = ''
  for (const h of hunks) {
    const next = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${h.lines.join('\n')}\n`
    if (out.length + next.length > MAX_CHARS) break
    out += next
  }
  return out
}

const sortEntries = (list: FsEntry[], showHidden: boolean) =>
  list
    .filter(en => showHidden || !en.name.startsWith('.'))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))

type Row = { path: string; entry: FsEntry; depth: number; isOpen: boolean; isLast: boolean[] }

// The project's file list for find, built on first search and dropped when Claude creates a file.
let index: { key: string; files: string[] } | null = null

// Records each file Claude edits or writes, and opens its diff while following is on.
const onWrite: Hook<'tool.call'> = async ($, e, next) => {
  if (e.tool !== 'Edit' && e.tool !== 'Write') return next(e)
  const r = await next(e)
  const out = r.result as { filePath?: string; structuredPatch?: Hunk[]; type?: string; staged?: boolean } | undefined
  if (r.isError || !out?.filePath || out.staged) return r
  const cwd = await $.session.cwd()
  const rel = out.filePath.startsWith(`${cwd}/`) ? out.filePath.slice(cwd.length + 1) : out.filePath
  const patch = toPatch(out.structuredPatch ?? [])
  if (out.type === 'create') index = null
  await update($, edits, list => [{ path: rel, patch }, ...list.filter(x => x.path !== rel)].slice(0, MAX_EDITS))
  if (await read($, follow)) {
    await update($, file, () => rel)
    await update($, diff, () => patch !== '')
    await update($, query, () => null)
  }
  return r
}
export const register: Register = on => {
  // The row under the focus ring and the folder rows last drawn; module memory is enough,
  // a reload just forgets the highlight until the next arrow press.
  let focused = ''
  let dirs = new Set<string>()

  on('tool.call', onWrite)

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    focused = e.element?.startsWith('row:') ? e.element.slice(4) : ''
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'files', description: 'Browse files and view code beside the chat' })
    return next(e)
  })

  on('command.run', { command: 'files' }, async ($, e) => {
    const isDock = e.presentation?.isFullscreen === true
    // Inline above the prompt the pane would push the chat away, so keep it short there.
    // Docked, ask for as wide as allowed: the engine caps the dock at 45% of the terminal, and a width the person dragged wins.
    const r = await $.ui.open({ id: PANE, title: 'Files', focus: true, columns: 400, backgroundColor: 'transparent', ...(isDock ? {} : { rows: 14 }) })
    if (!r.isPlaced) return { text: `Files pane waiting: ${r.reason}` }
    return {
      text: isDock
        ? 'Files pane opened.'
        : 'Files pane opened above the prompt. For a sidebar beside the chat, start Claude Code in the fullscreen layout: CLAUDE_CODE_NO_FLICKER=1 claude',
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code, Markdown, Input } = $.ui.resolve(e)
    // Pan offset and the widest diagram drawn, set while the file view builds its body.
    let x = 0
    let widest = 0
    const diagram = (src: string, key: string) => {
      const er = relations(src)
      if (er !== null && er.length > 0) {
        return (
          <Box key={key} flexDirection="column" paddingLeft={2} marginY={1}>
            {er.map((r, i) => (
              <Box key={`e${i}`} gap={1}>
                <Text bold color="suggestion">{r.from}</Text>
                <Text color="inactive">─ {r.label} →</Text>
                <Text bold color="suggestion">{r.to}</Text>
                <Text color="subtle">{r.card}</Text>
              </Box>
            ))}
          </Box>
        )
      }
      const arts = layouts(src)
      if (arts instanceof Error) {
        return (
          <Box key={key} flexDirection="column">
            <Text color="warning">  mermaid: {arts.message}</Text>
            <Code source={src} language="mermaid" wrap="truncate-end" />
          </Box>
        )
      }
      const art = pick(arts, width)
      widest = Math.max(widest, art.width)
      const shown = art.width <= width ? art.text : art.text.split('\n').map(l => l.slice(x, x + width)).join('\n')
      return <Code key={key} source={shown} wrap="truncate-end" />
    }
    const width = Math.max(20, e.props.bodyColumns)
    const top = await read($, root)
    const path = await read($, file)
    const showHidden = await read($, hidden)
    const hint = (keys: string) => <Text color="inactive">{keys}</Text>
    const changed = await read($, edits)
    const q = await read($, query)

    if (q !== null) {
      const key = `${top}|${showHidden}`
      if (index?.key !== key) {
        const files: string[] = []
        const queue = [top]
        while (queue.length > 0 && files.length < MAX_INDEX) {
          const dir = queue.shift()!
          let list: FsEntry[]
          try {
            list = await $.fs.list(dir)
          } catch {
            continue
          }
          for (const en of list) {
            if (!showHidden && en.name.startsWith('.')) continue
            const p = join(dir, en.name)
            if (en.kind === 'dir') { if (!SKIP.has(en.name)) queue.push(p) } else files.push(p)
          }
        }
        index = { key, files }
      }
      const prefix = top === '.' ? '' : `${top}/`
      const hits = q.trim() === ''
        ? changed.map(c => c.path).filter(p => p.startsWith(prefix)).slice(0, MAX_RESULTS).map(p => ({ p, s: 0 }))
        : index.files
            .map(p => ({ p, s: fuzzy(q, p.slice(prefix.length)) }))
            .filter((x): x is { p: string; s: number } => x.s !== null)
            .sort((a, b) => b.s - a.s)
            .slice(0, MAX_RESULTS)
      const openFile = (p: string) => {
        void update($, file, () => p)
        void update($, diff, () => false)
        void update($, query, () => null)
      }
      return (
        <Box flexDirection="column">
          <Box justifyContent="space-between" width={width}>
            <Text bold color="claude">🔍 Find in {fit(top === '.' ? './' : `${top}/`, width - 24)}</Text>
            <Button key="cancel" plain onPress={() => void update($, query, () => null)}>cancel</Button>
          </Box>
          <Input
            key="find"
            autoFocus
            placeholder="type part of a file name"
            value={q}
            submitLabel="open"
            onInput={v => void update($, query, () => v)}
            onSubmit={() => { if (hits[0]) openFile(hits[0].p) }}
          />
          <Text color="subtle">{'─'.repeat(width)}</Text>
          {hits.length === 0 && <Text dimColor>  {q.trim() === '' ? 'type to search' : 'no matches'}</Text>}
          {hits.map(({ p }) => {
            const name = p.split('/').pop()!
            const dir = p.slice(prefix.length, p.length - name.length)
            return (
              <Box key={`h:${p}`} gap={1}>
                <Button key={`hit:${p}`} plain onPress={() => openFile(p)}>
                  <Text color={COLORS[ext(name)] ?? 'text'}>{icon(name, false, false)} {name}</Text>
                </Button>
                <Text color="inactive">{fit(dir, Math.max(4, width - name.length - 6))}</Text>
              </Box>
            )
          })}
          {index.files.length >= MAX_INDEX && <Text dimColor>  search covers the first {MAX_INDEX} files</Text>}
          <Text color="subtle">{'─'.repeat(width)}</Text>
          {hint('type to filter · enter opens the top match · ↓ pick a result · esc chat')}
        </Box>
      )
    }

    if (path !== null) {
      const showRaw = await read($, raw)
      const held = await read($, pan)
      x = held.path === path ? held.x : 0
      const edit = changed.find(c => c.path === path)
      const showDiff = edit !== undefined && edit.patch !== '' && (await read($, diff))
      const name = path.split('/').pop()!
      const isMd = isMarkdown(path)
      const isDiagram = isMermaid(path)
      let body
      let meta = ''
      try {
        const text = await $.fs.read(path)
        const lines = text.split('\n')
        let shown = lines.slice(0, MAX_LINES).join('\n')
        if (shown.length > MAX_CHARS) shown = shown.slice(0, shown.lastIndexOf('\n', MAX_CHARS))
        const cut = text.length - shown.length
        meta = `${lines.length} lines · ${size(text.length)}`
        body = (
          <Box flexDirection="column">
            {showDiff
              ? <Code source={edit.patch} path={path} format="diff" wrap="truncate-end" />
              : showRaw || !(isMd || isDiagram)
              ? <Code source={shown} path={path} startLine={1} wrap="truncate-end" />
              : isDiagram
                ? diagram(shown, 'diagram')
                : splitMermaid(shown).map((part, i) =>
                    part.kind === 'mermaid' ? diagram(part.text, `d${i}`) : <Markdown key={`m${i}`} text={part.text} />)}
            {cut > 0 && <Text color="inactive">  … {size(cut)} more not shown</Text>}
          </Box>
        )
      } catch (err) {
        body = <Text color="error">  Cannot open this file: {String(err)}</Text>
      }
      const crumbs = path.split('/').slice(0, -1).filter(x => x !== '.').join(' › ')
      return (
        <Box flexDirection="column">
          <Box justifyContent="space-between" width={width}>
            <Box gap={1}>
              <Button key="back" plain hotkey="b" autoFocus onPress={() => void update($, file, () => null)}>back</Button>
              <Text>{icon(name, false, false)}</Text>
              <Text bold color={COLORS[ext(path)] ?? 'text'}>{name}</Text>
            </Box>
            <Box gap={2}>
              {edit !== undefined && edit.patch !== '' && (
                <Button key="diff" plain hotkey="v" onPress={() => void update($, diff, v => !v)}>
                  {showDiff ? 'file' : 'diff'}
                </Button>
              )}
              {(isMd || isDiagram) && !showDiff && (
                <Button key="raw" plain hotkey="p" onPress={() => void update($, raw, v => !v)}>
                  {showRaw ? 'preview' : 'source'}
                </Button>
              )}
              <Text color="inactive">{meta}</Text>
            </Box>
          </Box>
          {crumbs !== '' && <Text color="inactive">{fit(crumbs, width)}</Text>}
          {widest > width && (() => {
            const step = Math.max(8, Math.floor(width / 2))
            const move = (d: number) => void update($, pan, () => ({ path, x: Math.max(0, Math.min(widest - width, x + d)) }))
            return (
              <Box gap={2}>
                <Button key="left" plain hotkey="h" onPress={() => move(-step)}>◂ left</Button>
                <Text color="inactive">diagram columns {x + 1}–{Math.min(x + width, widest)} of {widest}</Text>
                <Button key="right" plain hotkey="l" onPress={() => move(step)}>right ▸</Button>
              </Box>
            )
          })()}
          <Text color="subtle">{'─'.repeat(width)}</Text>
          {body}
        </Box>
      )
    }

    const open = new Set(await read($, expanded))
    const rows: Row[] = []
    let error = ''
    const walk = async (dir: string, depth: number, isLast: boolean[]) => {
      let list: FsEntry[]
      try {
        list = sortEntries(await $.fs.list(dir), showHidden)
      } catch (err) {
        if (depth === 0) error = String(err)
        return
      }
      for (const [i, entry] of list.entries()) {
        if (rows.length >= MAX_ROWS) return
        const p = join(dir, entry.name)
        const last = [...isLast, i === list.length - 1]
        const isOpen = entry.kind === 'dir' && open.has(p)
        rows.push({ path: p, entry, depth, isOpen, isLast: last })
        if (isOpen) await walk(p, depth + 1, last)
      }
    }
    await walk(top, 0, [])
    dirs = new Set(rows.filter(r => r.entry.kind === 'dir').map(r => r.path))

    const isFollowing = await read($, follow)
    const touched = new Set(changed.map(c => c.path))
    const touchedDirs = new Set(changed.flatMap(c => c.path.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))))
    const toggle = (p: string) =>
      void update($, expanded, list => (list.includes(p) ? list.filter(x => x !== p) : [...list, p]))
    const setRoot = (p: string) => {
      void update($, root, () => p)
      void update($, expanded, () => [])
    }

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between" width={width}>
          <Text bold color="claude">{fit(top === '.' ? './' : `${top}/`, width - 28)}</Text>
          <Box gap={2}>
            <Button key="up" plain hotkey="u" onPress={() => setRoot(up(top))}>up</Button>
            <Button key="down" plain hotkey="d" onPress={() => { if (dirs.has(focused)) setRoot(focused) }}>into</Button>
            <Button key="hidden" plain hotkey="h" onPress={() => void update($, hidden, v => !v)}>
              {showHidden ? 'hide dot' : 'dotfiles'}
            </Button>
            <Button key="collapse" plain hotkey="c" onPress={() => void update($, expanded, () => [])}>collapse</Button>
          </Box>
        </Box>
        <Box gap={2}>
          <Button key="find" plain hotkey="f" onPress={() => void update($, query, () => '')}>🔍 find</Button>
          <Button key="follow" plain hotkey="w" onPress={() => void update($, follow, v => !v)}>
            {isFollowing ? '👁 following edits' : '👁 follow off'}
          </Button>
          {changed.length > 0 && <Text color="warning">● {changed.length} edited</Text>}
        </Box>
        <Text color="subtle">{'─'.repeat(width)}</Text>
        {error !== '' && <Text color="error">Cannot list {top}: {error}</Text>}
        {error === '' && rows.length === 0 && <Text dimColor>  (empty)</Text>}
        {rows.map((row, i) => {
          const guide = row.isLast.slice(0, -1).map(l => (l ? '   ' : '│  ')).join('') + (row.isLast.at(-1) ? '└─ ' : '├─ ')
          const isDir = row.entry.kind === 'dir'
          const isDot = row.entry.name.startsWith('.')
          const label = `${isDir ? (row.isOpen ? '▾' : '▸') : ' '} ${icon(row.entry.name, isDir, row.isOpen)} ${row.entry.name}${isDir ? '/' : ''}`
          const isTouched = isDir ? touchedDirs.has(row.path) : touched.has(row.path)
          const meta = (isTouched ? '● ' : '') + (isDir ? '' : row.entry.isLink ? 'link' : size(row.entry.size))
          return (
            <Box key={`r:${row.path}`} justifyContent="space-between" width={width}>
              <Box>
                <Text color="subtle">{guide}</Text>
                <Button
                  key={`row:${row.path}`}
                  plain
                  dimColor={isDot}
                  {...(i === 0 ? { autoFocus: true as const } : {})}
                  onPress={() => (isDir ? toggle(row.path) : void update($, file, () => row.path))}
                >
                  <Text color={isDir ? 'suggestion' : COLORS[ext(row.entry.name)] ?? 'text'} bold={isDir}>
                    {fit(label, Math.max(8, width - guide.length - meta.length - 2))}
                  </Text>
                </Button>
              </Box>
              <Text color={isTouched ? 'warning' : 'inactive'}>{meta}</Text>
            </Box>
          )
        })}
        {rows.length >= MAX_ROWS && <Text dimColor>  … list cut at {MAX_ROWS} rows, collapse some folders</Text>}
        <Text color="subtle">{'─'.repeat(width)}</Text>
        {hint('↑↓ move · enter open · f find · w follow · u up · d into · h dotfiles · c collapse')}
      </Box>
    )
  })
}
