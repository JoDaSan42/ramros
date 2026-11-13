# Idea: ROS2 Environment Health Check (`ros2 doctor`)

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

A command that runs `ros2 doctor` (and reports the ROS2 environment
health: RMW implementation, DDS settings, environment variables,
network config) and shows the results inside RAMROS.

## Motivation

- When something misbehaves (no nodes visible, topics not connecting),
  the environment is often the cause — RMW mismatch, missing env
  vars, multiple DDS participants.
- Running `ros2 doctor` by hand in a terminal is easy to forget; a
  one-click entry in RAMROS lowers the barrier.

## Concept

- Command "RAMROS: Run ROS2 Health Check" (command palette, possibly
  also on the live view).
- Runs `ros2 doctor --report` (machine-readable report) or plain
  `ros2 doctor`, captures the output.
- Display in a read-only document (pattern like the interface-show
  idea) or an info message summary with a "Show report" button.
- Warnings/errors could later surface in the Problems panel.

## Relation to existing code

- Command execution with output: `execAsync` pattern used for
  `ros2 bag info` (src/extension.ts:855).
- Read-only document display: same pattern as the interface-show idea
  (docs/ideas/2026-10-10-interface-show-definition.md).
