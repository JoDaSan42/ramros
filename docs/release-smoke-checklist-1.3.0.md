# Release 1.3.0 Manual Smoke Checklist

Manual pre-tag verification for release 1.3.0 (Task 20 of the release plan).
Run in VSCode with the RAMROS extension installed (Run Extension from `src/extension.ts`
or a built VSIX) against a sourced ROS2 workspace.

Prerequisites:

- A sourced ROS2 workspace with at least one built package (for interface checks).
- A running node with parameters (e.g. `ros2 run demo_nodes_py talker` or any node
  exposing `/parameter_events`) for live-view checks.
- A service server (e.g. `/reset` or `ros2 run examples_rclpy_minimal_service service`) for
  the service-call check.
- A second terminal for `ros2 topic echo` / `ros2 param get` verification.

## Checklist

- [ ] **ramros.json lifecycle** — Add a bag folder via "Add Bag Folder" (inline "+" on Bag
  Files) and remove it via the context menu; `ramros.json` in the first ROS2 workspace is
  created/updated with `bagFolders` accordingly. Edit `ramros.json` externally; the tree
  refreshes without reloading the window.
- [ ] **Live view toggle** — The eye icon in the ROS2 Live view title (and the first-row
  hint item) stops/starts CLI polling; the state survives a window reload via
  `liveView.enabled` in `ramros.json`. With the view disabled, no polling output appears.
- [ ] **Publish Message** — With `ros2 topic echo <topic>` open in a second terminal, run
  "Publish Message" (broadcast icon) on a live topic and provide JSON; the echoed message
  appears in the terminal.
- [ ] **Call Service** — Run "Call Service" (play icon) on a live service (e.g. `/reset`)
  and provide request JSON; the response is shown in a read-only document.
- [ ] **Runtime parameters** — Parameters expand under a live node in the live view; set a
  parameter via its edit action and confirm the new value with `ros2 param get` in a
  second terminal.
- [ ] **Show Definition** — On a built interface in the Workspaces view, "Show Definition"
  (eye icon) shows the resolved definition in a read-only document. On an interface from an
  unbuilt package, it shows the "Is the workspace built (colcon build)?" hint instead.
- [ ] **Health check** — The heart icon in the ROS2 Live view title runs the health check
  and shows the `ros2 doctor` report.
- [ ] **Wizard maintainer prompt** — In the package wizard, answering "no" to the
  maintainer prompt produces `todo` / `todo@todo.todo` placeholders in `package.xml`;
  entering an invalid email is rejected.
- [ ] **By-category create buttons** — In the by-category view, the inline "+" on Nodes,
  Interfaces, and Launch Files category folders opens the package picker.

## Result

| Item | Result | Notes |
|---|---|---|
| ramros.json lifecycle | | |
| Live view toggle | | |
| Publish Message | | |
| Call Service | | |
| Runtime parameters | | |
| Show Definition | | |
| Health check | | |
| Wizard maintainer prompt | | |
| By-category create buttons | | |

Status: NOT EXECUTED — documented only (2026-10-11; no interactive VSCode + ROS2 session
available on the verification machine). Automated verification: unit, integration, lint,
typecheck, and compile all green at commit cc9d3f0 — see
`.superpowers/sdd/2026-10-11-release-1.3.0/task-20-report.md`.
