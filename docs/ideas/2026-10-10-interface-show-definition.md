# Idea: "Show Interface Definition" via `ros2 interface show`

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

Context menu entry "Show Definition" on interface definitions
(.msg/.srv/.action) in the workspace tree. Runs
`ros2 interface show <pkg/type/Name>` and displays the fully resolved
definition in a read-only text document, like `git show`.

## Motivation

- Opening the .msg/.srv/.action file in the editor shows only that
  file's own fields — embedded types (e.g. `geometry_msgs/Point` in a
  field) stay unresolved.
- `ros2 interface show` resolves all referenced types and shows the
  complete structure.
- Side effect: it only works if the interface is installed/built —
  acting as a quick check that `colcon build` is needed.

## Concept

- Context menu on an interface item in the workspace tree:
  "Show Definition".
- RAMROS runs `ros2 interface show <pkg/type/Name>` (execAsync) and
  shows the output in a read-only text document in the editor
  (pattern like `git show`).
- If the command fails (interface not installed/built), show an error
  message hinting at `colcon build`.
- Interface items need their fully qualified name (`pkg/msg/Foo`) to
  build the command.

## Relation to existing code

- Interface tree items live in the workspace tree (src/treeview/);
  they already expose context-menu commands (create etc.).
- Command execution with output: reuse `execAsync` pattern used for
  `ros2 bag info` (src/extension.ts:855).
- Command registration + package.json menu contributions follow the
  existing pattern (e.g. `ramros.live.echoTopic`).
