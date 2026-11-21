import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'glance',
  component: 'Pane',
  requestId: 'files',
  props: {
    title: 'Files',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
  surface: 'terminal',
} as const

const entry = (name: string, kind: 'file' | 'dir', size = 0) => ({ name, kind, size, mtimeMs: 0, isLink: false })

test('the tree lists folders first and hides dotfiles', async ($, on) => {
  on('fs.list', () => ({
    value: [entry('b.ts', 'file', 2048), entry('.env', 'file', 10), entry('src', 'dir'), entry('a.md', 'file', 5)],
  }))

  const ui = await $.ui.mount(PANE)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const names = texts.filter(t => /src\/|a\.md|b\.ts|\.env/.test(t))

  expect(names.length).toBe(3)
  expect(names[0]).toMatch(/src\//)
  expect(names[1]).toMatch(/a\.md/)
  expect(names[2]).toMatch(/b\.ts/)
  expect(texts.some(t => t === '2.0 KB')).toBe(true)
  await ui.unmount()
})

test('a folder that cannot be listed says so', async ($, on) => {
  on('fs.list', () => {
    throw new Error('EACCES')
  })

  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Text', text: /Cannot list/ })).toBeTruthy()
  await ui.unmount()
})
