import * as vscode from 'vscode';

export abstract class TreeItemBase extends vscode.TreeItem {
  abstract getChildren(): Promise<TreeItemBase[]>;
}
