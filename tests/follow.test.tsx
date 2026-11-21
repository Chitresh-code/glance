import { expect, test } from 'claude-code/testing'
import { fuzzy } from '../hooks/fuzzy'

const PANE = {
  plugin: 'glance',
  component: 'Pane',
  requestId: 'files',
  props: { title: 'Files', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  surface: 'terminal',
} as const
const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 9, mtimeMs: 0, isLink: false })

test('fuzzy ranks a file-name match above a scattered path match', () => {
  const name = fuzzy('reg', 'hooks/register.tsx')!
  const scattered = fuzzy('reg', 'src/r/e/g/other.ts')!
  expect(name).toBeGreaterThan(scattered)
  expect(fuzzy('xyz', 'hooks/register.tsx')).toBe(null)
})

test("an Edit by Claude opens the file's diff and marks it in the tree", async ($, on) => {
  on('tool.call', () => ({
    result: {
      filePath: '/proj/src/a.ts', oldString: 'x', newString: 'y', originalFile: 'x\n', userModified: false, replaceAll: false,
      structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-x', '+y'] }],
    },
  }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.read', () => ({ value: 'y\n' }))
  on('fs.list', (_, e) =>
    e.path.endsWith('/src') ? { value: [entry('a.ts', 'file')] } : { value: [entry('src', 'dir')] })

  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'x', new_string: 'y' })
  const ui = await $.ui.mount(PANE)
  const code = await ui.find({ type: 'Code' })
  expect(code?.props?.format).toBe('diff')
  expect(String(code?.props?.source)).toContain('+y')

  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Text', text: /1 edited/ })).toBeTruthy()
  await ui.unmount()
})

test('find lists fuzzy matches and enter opens the top one', async ($, on) => {
  // The engine hands the hook absolute paths, so match on the last segment.
  on('fs.list', (_, e) =>
    e.path.endsWith('/hooks')
      ? { value: [entry('register.tsx', 'file')] }
      : e.path.endsWith('/node_modules')
        ? { value: [entry('regex.js', 'file')] }
        : { value: [entry('hooks', 'dir'), entry('node_modules', 'dir'), entry('README.md', 'file')] })
  on('fs.read', () => ({ value: 'code\n' }))

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'find' })
  await ui.input({ key: 'find', text: 'reg', kind: 'change' })
  expect(await ui.find({ key: 'hit:hooks/register.tsx' })).toBeTruthy()
  expect(await ui.find({ key: 'hit:node_modules/regex.js' })).toBeFalsy()

  await ui.input({ key: 'find', text: 'reg' })
  expect(await ui.find({ type: 'Text', text: 'register.tsx' })).toBeTruthy()
  await ui.unmount()
})
