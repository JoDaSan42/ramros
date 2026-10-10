# Idea: Runtime Node Parameters in the ROS2 Live View

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

The ROS2 live view (running nodes / topics) gains runtime parameters:
each running node lists its parameters as children, with the current
value shown next to each name. Clicking a parameter opens an edit box
that sets the value on the running node via `ros2 param set`.

## Motivation

- RAMROS shows parameters from static analysis (`declare_parameter` in
  source), but not what a running node actually uses — YAML defaults
  and command-line overrides are invisible.
- Setting a parameter today means typing
  `ros2 param set <node> <name> <value>` in a terminal by hand.

## Concept

- Under each running node (`LiveNodeItem` in the live view), children
  are the node's parameters, fetched via `ros2 param list <node>`.
- Each parameter item shows the current value (from `ros2 param get`)
  as its description next to the parameter name.
- Clicking a parameter item opens an input box pre-filled with the
  current value; changing it and pressing Enter runs
  `ros2 param set <node> <name> <value>`.
- The live view already refreshes periodically (`ramros.liveView.refreshRate`
  setting); parameters are re-fetched on expand/refresh.
- Read/write only — no parameter type editing beyond what `ros2 param set`
  accepts as string.

## Design notes

- No name matching needed: the live view lists nodes by their actual
  runtime names from `ros2 node list` (namespaces included), so
  parameters hang directly on the correct node.
- Static analysis (workspace view) stays untouched.

## Relation to existing code

- Live view: src/treeview/live-tree-provider.ts, src/treeview/live-items.ts
  (LiveNodeItem currently has no children).
- Live view refresh + config: `ramros.liveView.refreshRate`,
  `ramros.liveView.hideSystemTopics` handled in LiveTreeProvider.
- Command execution with output: reuse the pattern of
  `executeCommandAndGetOutput` (src/extension.ts) used for
  `ros2 topic list`.
