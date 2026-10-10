# Idea: External Bag Folders, rqt_bag Button, and ramros.json

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

RAMROS gets a per-workspace configuration file (`ramros.json`), external
rosbag folders listed in the tree view, and a one-click way to open any
bag file in rqt_bag.

## Motivation

- Bag files outside the workspace (recordings, USB drives) are invisible
  to RAMROS today; the tree view only finds bags inside workspace folders.
- Opening a bag in rqt_bag requires typing the command by hand.
- VSCode user settings are global; project-specific behavior has nowhere
  to live.

## Concept

### 1. `ramros.json` — per-workspace configuration

- File at workspace root, JSON format.
- Read by RAMROS when the workspace is loaded.
- Extensible for future project-specific settings; first key:

```json
{
  "bagFolders": ["/absolute/path/to/bags", "/another/folder"]
}
```

- Written by RAMROS when bag folders are added/removed via the UI.

### 2. External bag folders in the tree view

- Add via context menu on the "Bag Files" folder ("Add bag folder…")
  and/or a "+" inline icon next to it.
- Multiple folders supported.
- Each external folder appears as its own row in the tree, with its bag
  files (`.db3`/`.mcap`) as children:

```
Bag Files                     [+]     ← workspace bags as before
  ├─ workspace_bag.db3
  📁 /home/parallels/recordings       ← external folder from ramros.json
  │  └─ montag.db3
  📁 /media/usb/rosbags
     └─ testfahrt.db3
```

- External folders are removed via context menu ("Remove") — also
  persisted in ramros.json.
- Workspace bags stay under "Bag Files" as today.

### 3. rqt_bag button on every bag file

- Every bag item in the tree (workspace or external) gets a small inline
  button/icon next to it; clicking starts `rqt_bag <path>` directly.
- Also added to the bag item's context menu, consistent with
  play/record entries.
- rqt_bag runs in a terminal, like the other tools (RVIZ2, rqt_graph).

## Open Questions

- Should external folders be scanned recursively for bags, or only the
  top level? (unresolved)
- Where exactly the rqt_bag inline button lives (inline icon vs. command
  on the item) — final call during planning.
- Should ramros.json changes on disk (e.g. edited by hand) hot-reload the
  tree? (unresolved)

## Relation to existing code

- `findWorkspaceBags` (src/extension.ts) currently scans only workspace
  folders via `vscode.workspace.findFiles` — external folders need their
  own scan (fs-based).
- Bag tree items live in src/treeview/bag-items.ts; the "Bag Files"
  folder item gains the add/remove folder commands.
- Terminal execution goes through the existing terminal manager, like
  RVIZ2/rqt_graph launches.
