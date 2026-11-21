import { expect, test } from 'claude-code/testing'
import { renderMermaidASCII } from '../hooks/vendor/mermaid.js'

const PANE = {
  plugin: 'glance',
  component: 'Pane',
  requestId: 'files',
  props: {
    title: 'Files',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
  surface: 'terminal',
} as const

test('the bundled renderer draws flowcharts and sequence diagrams in the sandbox', () => {
  const flow = renderMermaidASCII('graph LR\n  A[Start] --> B[Done]', { colorMode: 'none' })
  const seq = renderMermaidASCII('sequenceDiagram\n  Alice->>Bob: Hi', { colorMode: 'none' })

  expect(flow).toContain('Start')
  expect(flow).toContain('─')
  expect(seq).toContain('Alice')
  expect(seq).toContain('Hi')
})

test('a mermaid fence in an open Markdown file is drawn as a diagram', async ($, on) => {
  on('state.get', (_, e, next) => (e.key === 'file' ? { value: { value: 'doc.md', version: 1 } } : next(e)))
  on('fs.read', () => ({ value: '# Flow\n\n```mermaid\ngraph LR\n  A[Start] --> B[Done]\n```\n\nAfter.\n' }))

  const ui = await $.ui.mount(PANE)
  const code = await ui.findAll({ type: 'Code' })
  const drawn = code.map(c => String(c.props?.source ?? '')).join('\n')

  expect(drawn).toContain('Start')
  expect(drawn).toContain('┌')
  expect(drawn).not.toContain('graph LR')
  await ui.unmount()
})

test('a diagram that does not parse shows a warning and its source', async ($, on) => {
  on('state.get', (_, e, next) => (e.key === 'file' ? { value: { value: 'bad.mmd', version: 1 } } : next(e)))
  on('fs.read', () => ({ value: 'notadiagram ->-> ???' }))

  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Text', text: /mermaid:/ })).toBeTruthy()
  await ui.unmount()
})

test('a diagram wider than the pane can be panned instead of being cut off', async ($, on) => {
  on('state.get', (_, e, next) => (e.key === 'file' ? { value: { value: 'wide.mmd', version: 1 } } : next(e)))
  on('fs.read', () => ({ value: 'sequenceDiagram\n  Scheduler->>SendQueueWorker: a long message that makes this diagram very wide\n  SendQueueWorker->>RenderServiceProcess: another long message drawn across the page' }))

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  const before = String((await ui.find({ type: 'Code' }))?.props?.source)
  expect(Math.max(...before.split('\n').map(l => l.length))).toBeLessThanOrEqual(40)
  expect(await ui.find({ type: 'Text', text: /diagram columns 1–40 of/ })).toBeTruthy()

  await ui.press({ key: 'right' })
  expect(String((await ui.find({ type: 'Code' }))?.props?.source)).not.toBe(before)
  expect(await ui.find({ type: 'Text', text: /diagram columns 21–/ })).toBeTruthy()
  await ui.unmount()
})

test('an ER diagram is listed as relationships', async ($, on) => {
  on('state.get', (_, e, next) => (e.key === 'file' ? { value: { value: 'model.mmd', version: 1 } } : next(e)))
  on('fs.read', () => ({ value: 'erDiagram\n  USER ||--o{ MEMBERSHIP : has\n  WORKSPACE ||--|| SUBSCRIPTION : has' }))

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'MEMBERSHIP' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '1 → 0..n' })).toBeTruthy()
  expect(await ui.find({ type: 'Code' })).toBeFalsy()
  await ui.unmount()
})
