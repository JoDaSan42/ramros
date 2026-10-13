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

- [*] **ramros.json lifecycle** — Add a bag folder via "Add Bag Folder" (inline "+" on Bag
  Files) and remove it via the context menu; `ramros.json` in the first ROS2 workspace is
  created/updated with `bagFolders` accordingly. Edit `ramros.json` externally; the tree
  refreshes without reloading the window.
- [*] **Live view toggle** — The eye icon in the ROS2 Live view title (and the first-row
  hint item) stops/starts CLI polling; the state survives a window reload via
  `liveView.enabled` in `ramros.json`. With the view disabled, no polling output appears.
- [ ] **Publish Message** — With `ros2 topic echo <topic>` open in a second terminal, run
  "Publish Message" (broadcast icon) on a live topic and provide JSON; the echoed message
  appears in the terminal. 
  Remark: 
  * The json interface is pretty unintuitive. As the structure of the topic is known this could be made easier
  * Doesn't work when no node is running. 
  → Follow-up: structured input design (prefilled JSON skeleton from known message type); publish without a running node.
- [ ] **Call Service** — Run "Call Service" (play icon) on a live service (e.g. `/reset`)
  and provide request JSON; the response is shown in a read-only document.
  Remark: Here also a different input method would be good. As the json format which is necessary is not known for most of the users. Propose a method for these how this can be imporoved. Is it possible to show the structure of the message and one can easily enter the values?
  → Follow-up: same structured input design as Publish Message.
- [ ] **Runtime parameters** — Parameters expand under a live node in the live view; set a
  parameter via its edit action and confirm the new value with `ros2 param get` in a
  second terminal.
  Remarks:
  * Add a check for the value that is entered otherwise there will be an error shown that the parameter cannot be set
  → Follow-up: validate input against the known parameter type before calling `ros2 param set`.
- [ ] **Show Definition** — On a built interface in the Workspaces view, "Show Definition"
  (eye icon) shows the resolved definition in a read-only document. On an interface from an
  unbuilt package, it shows the "Is the workspace built (colcon build)?" hint instead.
  Remark: The show definition of an interface doesn't work. It shows that the interface is unknown or the workspace is not built. maybe the overlay is not sourced properly with the call?
  → Follow-up: debug overlay sourcing of the `ros2 interface show` call.
- [ ] **By-category create buttons** — In the by-category view, the inline "+" on Nodes,
  Interfaces, and Launch Files category folders opens the package picker.
    Remarks:
    * Doesn't seem to work as expected for launch files
    → Follow-up: check contextValue/command wiring for the Launch Files category folder.
- [*] **Health check** — The heart icon in the ROS2 Live view title runs the health check
  and shows the `ros2 doctor` report.
- [*] **Wizard maintainer prompt** — In the package wizard, answering "no" to the
  maintainer prompt produces `todo` / `todo@todo.todo` placeholders in `package.xml`;
  entering an invalid email is rejected.
- [ ] **By-category create buttons** — In the by-category view, the inline "+" on Nodes,
  Interfaces, and Launch Files category folders opens the package picker.
    Remarks:
    * Doesn't seem to work as expected for launch files

## Result

| Item | Result | Notes |
|---|---|---|
| ramros.json lifecycle | PASS | |
| Live view toggle | PASS | |
| Publish Message | WORKS, UX gaps | JSON input unintuitive; no publish without a running node |
| Call Service | WORKS, UX gaps | JSON input unintuitive for unknown message formats |
| Runtime parameters | WORKS, validation gap | No input validation against parameter type |
| Show Definition | FAIL | Interface shown as unknown / workspace not built despite built overlay |
| Health check | PASS | |
| Wizard maintainer prompt | PASS | |
| By-category create buttons | PARTIAL | Works for Nodes/Interfaces; Launch Files category doesn't open package picker |

Status: EXECUTED 2026-10-13 by user (interactive VSCode + ROS2 session). 4 PASS,
3 WORKS with follow-ups, 1 PARTIAL, 1 FAIL. Findings tracked as follow-ups in the
respective checklist items; fixes planned in the next increment.
