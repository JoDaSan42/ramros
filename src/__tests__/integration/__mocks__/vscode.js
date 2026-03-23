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
    updateWorkspaceFolders: jest.fn()
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
    showQuickPick: jest.fn()
  },
  TreeItem: class TreeItem {
    constructor(_label, _collapsibleState) {}
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
  Uri: {
    file: (path) => ({ fsPath: path, path }),
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
  }
};
