# Idea: `ros2 topic pub` from the Live View

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

Context menu entry on a live topic to publish a message — the
counterpart to the existing echo/hz commands. Runs `ros2 topic pub`
once or at a given rate.

## Motivation

- RAMROS can subscribe (echo, hz) but not publish; publishing test
  messages means typing `ros2 topic pub` by hand.
- Useful for manually feeding a node under test (sensor replacement,
  trigger inputs).

## Concept

- Context menu on a live topic: "Publish Message…".
- Ask what to publish:
  - `once` (single message) or `rate` (with `--rate N`).
  - Message content as YAML/JSON in an input box (default `{}`).
- RAMROS resolves the topic type (`ros2 topic type <name>`) and runs
  `ros2 topic pub <topic> <type> <content> [--once | --rate N]` in a
  terminal (interactive, so Ctrl+C stops publishing).
- Output goes to a terminal (like echo/hz), not an info message.

## Relation to existing code

- Live topic items and echo/hz commands: src/treeview/live-items.ts,
  `ramros.live.echoTopic` / `ramros.live.hzTopic` (src/extension.ts:791-808).
- Terminal execution via terminalManager.executeInNewTerminal.
