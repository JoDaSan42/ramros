# Idea: Enable/Disable Switch for the ROS2 Live View

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

A switch directly under the title bar of the ROS2 live view to enable
or disable it. Disabling stops the periodic `ros2 node list` /
`ros2 topic list` polling — helpful when the live view causes
performance problems.

## Motivation

- The live view polls continuously (`ramros.liveView.refreshRate`),
  which can cause performance problems on slow machines or large
  systems with many nodes/topics.
- Today there is no way to pause the polling; only lowering the refresh
  rate or deactivating the whole view in the settings is possible.

## Concept

- A switch (toggle) directly below the view's title bar toggles the
  live view on/off.
- **Off:** polling stops entirely, the view shows an "inactive" state
  (e.g. a hint item like "Live view disabled — switch on to refresh").
- **On:** polling resumes with the configured refresh rate.
- The state is workspace-dependent and persists in the `ramros.json`
  of the workspace (see the `ramros.json` idea document) — e.g.
  `{"liveView": {"enabled": false}}` — so it survives sessions and
  restarts.
- The refresh rate is also read from the `ramros.json` (e.g.
  `{"liveView": {"refreshRate": 10}}`, in seconds), making the whole
  live view configuration workspace-dependent. It replaces the global
  `ramros.liveView.refreshRate` setting for this workspace when
  present; otherwise the global setting applies as fallback.

## Relation to existing code

- Live view with periodic refresh: src/treeview/live-tree-provider.ts
  (refresh timer, `ramros.liveView.refreshRate`).
- The LiveTreeProvider already reacts to configuration changes
  (`onDidChangeConfiguration`) — the `enabled` flag hooks in there.
- Persistence goes into the per-workspace `ramros.json`
  (docs/ideas/2026-10-10-bag-folders-ramros-json.md), not into
  global VSCode settings.
