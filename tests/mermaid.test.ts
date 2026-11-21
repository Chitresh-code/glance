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
