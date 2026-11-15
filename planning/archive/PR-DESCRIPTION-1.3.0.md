# Release 1.3.0

## Summary

Live view interaction, diagnostics and interface tooling for v1.3.0, including
smoke test fixes and strict parameter type validation.

## Features

- Live view: publish message, call service, set/toggle parameters with persistence in ramros.json
- ros2 doctor health check with read-only report document
- Resolved interface definitions via "Show Definition" (ros2 interface show)
- Create buttons on category folders (Nodes/Interfaces/Launch Files) in by-category view
- Package wizard maintainer/license prompt with email validation

## Fixes (from release smoke test)

- showInterfaceDefinition sources the workspace overlay so workspace interfaces resolve
- Publish works without a running node via manual topic type fallback
- createLaunchFile asks for the target package on category folders and presets it in the wizard
- Live setParameter validates input against the parameter type before applying
- Launch wizard enforces strict parameter types: ints rejected for doubles and vice versa;
  whole-number doubles serialize as float literals (1.0), inferType handles scientific
  notation, C++ suffixes and templated declare_parameter calls

## Verification

- 206 unit + 257 integration tests green, lint and typecheck clean
- Manual smoke checklist executed (docs/release-smoke-checklist-1.3.0.md)

## Not in this release

- Structured webview input for publish/service calls (design: docs/superpowers/specs/2026-10-13-structured-message-input-design.md) — deferred to next increment
