# glance

A Claude Code plugin that adds a file explorer beside the chat. Run `/files` to open a pane with your project as an expandable tree, then open any file to read it with syntax highlighting, or read Markdown rendered. Mermaid diagrams, in `.mmd` files or ` ```mermaid ` blocks in Markdown, are drawn as text diagrams.

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
- `f` finds a file: type part of its path, Enter opens the best match, or ↓ to pick another. With nothing typed it lists the files Claude edited. `node_modules`, `.git` and build folders are skipped.
- `w` turns following Claude's edits on or off (on by default)
- In a file: `b` goes back, `p` switches Markdown and Mermaid between preview and source, `v` switches between the file and Claude's last change to it

## Following Claude's edits

Whenever Claude edits or writes a file, glance marks it with a ● in the tree (folders that contain it get one too) and, while following is on, opens the file showing the diff of that edit. Press `v` to see the whole file. The diff shows Claude's latest edit to that file, not every change since the session began.

The pane docks on the right beside the chat in Claude Code's fullscreen layout (`CLAUDE_CODE_NO_FLICKER=1 claude`). On the main screen it opens as a short block above the prompt. Colors follow your Claude Code theme.

## Limits

Read only: it does not edit, create, rename or delete files. A file shows its first 3000 lines or about 90 KB, and files over 4 MiB do not open. The tree shows at most 1500 rows at once, and find searches the first 20000 files.

## Third-party code

`hooks/vendor/mermaid.js` is the ASCII renderer of [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT), bundled because a plugin cannot install packages. How it was built and the license texts are in `hooks/vendor/THIRD_PARTY_LICENSES.txt`.

## Develop

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```

Once a session has loaded the plugin, `tsc -p .` type-checks it against the types Claude Code writes into `.claude-plugin/types/`.
