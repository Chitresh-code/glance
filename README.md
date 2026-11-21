# glance

A Claude Code plugin that adds a file explorer beside the chat. Run `/files` to open a pane with your project as an expandable tree, then open any file to read it with syntax highlighting, or read Markdown rendered.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install glance --marketplace Chitresh-code/glance
```

Answer `y` to add the marketplace, then pick a scope (user installs it for every session).

From a shell:

```
claude plugin install glance --marketplace Chitresh-code/glance
```

## Use

Run `/files`. The pane takes the keyboard; Esc returns to the prompt.

- ↑ ↓ move, Enter expands a folder or opens a file
- `u` moves the tree root up a folder, `d` makes the highlighted folder the root
- `h` shows or hides dotfiles, `c` collapses every folder
- In a file: `b` goes back, `p` switches Markdown between preview and source

The pane docks on the right beside the chat in Claude Code's fullscreen layout (`CLAUDE_CODE_NO_FLICKER=1 claude`). On the main screen it opens as a short block above the prompt. Colors follow your Claude Code theme.

## Limits

Read only: it does not edit, create, rename or delete files. A file shows its first 3000 lines or about 90 KB, and files over 4 MiB do not open. The tree shows at most 1500 rows at once.

## Develop

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```

Once a session has loaded the plugin, `tsc -p .` type-checks it against the types Claude Code writes into `.claude-plugin/types/`.
