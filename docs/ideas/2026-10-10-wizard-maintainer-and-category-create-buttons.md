# Idea: Package Wizard Maintainer/License Prompt & Create Buttons in Category View

Status: brainstormed, not yet planned or built
Date: 2026-10-10

## Summary

Two UX improvements found while testing the previous changes:

1. The package wizard asks whether maintainer/license entries should be
   written to package.xml at all; if not, ROS placeholder values are used.
   If an email IS entered, it must be valid.
2. In the tree view's "by category" sort mode (nodes / interfaces /
   launch files), there is currently no way to create nodes or
   interfaces. Category folders get "+" buttons with a package picker.

## Motivation

- An invalid maintainer email in package.xml only surfaces at
  `colcon build` time, long after the wizard is done — annoying to fix.
- Not everyone wants to fill in maintainer/license metadata for
  experiments; ROS convention provides placeholders for that.
- Switching the workspace view to category sorting removes the package
  folders, and with them every entry point for creating nodes,
  interfaces, and launch files.

## Concept

### 1. Package wizard: maintainer/license prompt + email validation

- New wizard step (before the author questions): "Specify maintainer
  and license in package.xml?" (yes/no quick pick).
- **No:** no further maintainer/license questions. package.xml gets ROS
  placeholder values: maintainer name `todo`, email `todo@todo.todo`.
  The license still comes from the quick pick (selection, can't be
  invalid).
- **Yes:** the existing inputs appear — author name, author email,
  license — but the email input is now validated: invalid entries are
  rejected (`validateInput` on the InputBox using the existing
  `validateEmail` logic from package-form-validator.ts). Only a
  syntactically valid email is accepted. Empty input stays allowed and
  falls back to the placeholder.
- The maintainer-name input stays free-text (a name can't be invalid).

### 2. "+" buttons on category folders in "by category" view

- Each of the three category folders (Nodes, Interfaces, Launch Files)
  gets an inline "+" icon (always visible) in `byCategory` sort mode.
- Click opens a quick pick "In which package should the node be
  created?" listing the packages of that workspace, then the regular
  node/interface/launch-file wizard runs as usual.
- If the workspace has no packages: short warning message
  ("No packages in workspace") instead of an empty quick pick.
- All packages are offered for interfaces (RAMROS can create
  interfaces in any package).

## Relation to existing code

- `runPackageWizard` (src/wizard/package-wizard.ts:125-145) currently
  asks description / author name / author email / license unconditionally
  with no email validation on the input box.
- `validateEmail` already exists in src/wizard/package-form-validator.ts:60
  but is not wired to the wizard's input box.
- `getCategoryChildren` (src/treeview/tree-provider.ts:185) builds the
  Nodes/Interfaces/Launch Files folder items in `byCategory` mode;
  these items currently expose no create commands.
- Category folder items live in src/treeview/ (CategoryNodesFolderItem,
  CategoryInterfacesFolderItem, CategoryLaunchFilesFolderItem).
