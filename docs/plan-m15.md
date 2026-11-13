# M15: notes like Notion, LeetCode as a note

The owner (2026-11-12): "leet code should be part of notes, a note can contain checkboxes, markdown, etc just like notion. not connected to the 'tasks' section". Asked and answered: a Notion-style editor (one pane, what you see is formatted), and LeetCode as one checklist note.

## Goals

- Notes and the diary's Today are written in one pane: formatted as you type, Markdown shortcuts (`# `, `- `, `[] `, `> `, ```` ``` ````), a toolbar, a `/` menu, checkboxes ticked with a click.
- What is stored stays Markdown in `_body`, so agents, search, export and cards don't change. The Cave's own marks round-trip: `[[Title]]`, `[[Title|label]]`, `:red[text]`, `==text==`, ```` ```mermaid ```` (drawn under its source). Tables, images (shown as links, never loaded) and raw HTML (shown as text) are kept, never dropped.
- A checkbox in a note belongs to the note: never a task, never in Tasks or the Agenda.
- LeetCode is one note: seed migration 27 writes every live problem into the note "LeetCode" (topic LeetCode), a `##` heading per group and a `- [ ]` / `- [x]` line per problem with its number, name, difficulty and any other field it had; the problems and the `leetcode` collection are marked deleted, never removed. The LeetCode tab, its progress page and table go; old links open the topic.
- A note card with checkboxes shows its progress (done/total).

## Non-goals

- Real-time collaboration, comments, block drag handles, embeds, images that load.
- Changing how agents write notes (still Markdown through MCP).

## Constraints

- New runtime dependency: Tiptap 3.32.1 (`@tiptap/core`, `pm`, `react`, `starter-kit`, `markdown`, `extension-list`, `extensions`, `extension-table`), pinned exact; branch + PR (migration on real data and a dependency).
- Saving: only an edit the owner makes writes; opening a note never rewrites its Markdown. Saved on blur and after two seconds idle; a change from elsewhere under an unsaved edit asks (Reload / Keep mine), as before.
- Text is escaped only where Markdown needs it: `&` and `<` stay readable unless they would start an entity or a tag.
