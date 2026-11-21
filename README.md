# glance

A Claude Code plugin that adds a file explorer beside the chat. Run `/files` to open a pane with your project as an expandable tree, then open any file to read it with syntax highlighting, or read Markdown rendered. Mermaid diagrams, in `.mmd` files or ` ```mermaid ` blocks in Markdown, are drawn as text diagrams, laid out to fit the pane where they can (a left-to-right flowchart turns top-down) and panned with `h`/`l` where they cannot. ER diagrams are listed as relationships, since they do not draw cleanly as text.

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

### Updates

Claude Code updates a plugin when its version number changes. Marketplaces other than Anthropic's own have auto-update off by default, so turn it on once: run `/plugin`, open **Marketplaces**, pick **glance** and choose **Enable auto-update**. Claude Code then pulls new versions at startup. To update by hand instead:

```
claude plugin marketplace update glance
```

## Use

Run `/files`. The pane takes the keyboard; Esc returns to the prompt.

- ↑ ↓ move, Enter expands a folder or opens a file
- `u` moves the tree root up a folder, `d` makes the highlighted folder the root
- `h` shows or hides dotfiles, `c` collapses every folder
- `f` finds a file: type part of its path, Enter opens the best match, or ↓ to pick another. With nothing typed it lists the files Claude edited. `node_modules`, `.git` and build folders are skipped.
- `w` turns following Claude's edits on or off (on by default)
- In a file: `b` goes back, `p` switches Markdown and Mermaid between preview and source, `v` switches between the file and Claude's last change to it, `h` and `l` pan a diagram wider than the pane

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

Raise `version` in `.claude-plugin/plugin.json` with every release: installed copies only update when it changes.

Once a session has loaded the plugin, `tsc -p .` type-checks it against the types Claude Code writes into `.claude-plugin/types/`.
