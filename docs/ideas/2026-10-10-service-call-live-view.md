# Idea: Call Services from the Live View (`ros2 service call`)

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

Running nodes in the live view list their services; a context menu
entry calls a service via `ros2 service call`. Recommended first step:
the simple variant (JSON input box). A comfortable form variant
(generated per-field input from the interface definition) is noted as
a possible extension.

## Motivation

- RAMROS shows services from static analysis, but there is no way to
  call one — today that means typing
  `ros2 service call /name std_srvs/srv/Trigger "{}"` by hand.
- Request bodies must match the field names/types exactly, which is
  tedious without help.

## Concept

### Phase 1 (recommended first step)

- Under a running node in the live view, list its services as children
  (from `ros2 node info <node>`, which reports service servers).
- Context menu on a service: "Call Service…".
- RAMROS resolves the service type (`ros2 service type <name>`) and
  opens an input box for the request JSON, pre-filled with `{}`.
- On confirm, run `ros2 service call <name> <type> '<json>'` and show
  the response (info message or output channel).

### Phase 2 (possible extension, more effort)

- Parse the request fields from the interface definition
  (`ros2 interface show <type>`) and generate a per-field form
  (quick pick/input box with type hints and defaults); RAMROS builds
  the JSON. Nested types make this considerably harder.
- Confirmation dialog before sending, since service calls can change
  robot state (e.g. triggers).

## Relation to existing code

- Live view: src/treeview/live-tree-provider.ts, src/treeview/live-items.ts
  (LiveNodeItem gets service children, similar to the runtime-params idea).
- Command execution with output: `execAsync` pattern (src/extension.ts).
- Related idea: docs/ideas/2026-10-10-runtime-params-live-view.md
  (same children-under-live-node pattern).
