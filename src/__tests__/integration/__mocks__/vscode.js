module.exports = {
  workspace: {
    workspaceFolders: [],
    fs: {
      stat: jest.fn().mockRejectedValue(new Error('Not implemented'))
    },
    createFileSystemWatcher: jest.fn().mockReturnValue({
      onDidChange: jest.fn(),
      onDidCreate: jest.fn(),
      onDidDelete: jest.fn(),
      dispose: jest.fn()
    }),
    getWorkspaceFolder: jest.fn().mockReturnValue(null),
    updateWorkspaceFolders: jest.fn(),
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn((_key, defaultValue) => defaultValue)
    }),
    onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidChangeWorkspaceFolders: jest.fn().mockReturnValue({ dispose: jest.fn() })
  },
  window: {
    createTerminal: jest.fn((options) => {
      const name = typeof options === 'object' && options.name ? options.name : 'mock-terminal';
      return {
        name,
        sendText: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn(),
        exitStatus: undefined
      };
    }),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    showOpenDialog: jest.fn(),
    withProgress: jest.fn(),
    createTreeView: jest.fn()
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn()
  },
  debug: {
    startDebugging: jest.fn()
  },
  ProgressLocation: { Notification: 15 },
  TreeItem: class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Expanded: 1,
    Collapsed: 2
  },
  ThemeIcon: class ThemeIcon {
    constructor(_id, _color) {}
  },
  ThemeColor: class ThemeColor {
    constructor(_id) {}
  },
  MarkdownString: class MarkdownString {
    constructor(_value) {}
  },
  RelativePattern: class RelativePattern {
    constructor(_baseUriOrWorkspaceFolder, _path) {}
  },
  Uri: {
    file: (p) => ({ fsPath: p, path: p }),
    joinPath: (uri, ...paths) => {
      const path = require('path');
      return { fsPath: path.join(uri.fsPath, ...paths) };
    }
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64
  },
  EventEmitter: class EventEmitter {
    event = jest.fn();
    fire = jest.fn();
    dispose = jest.fn();
  }
};
