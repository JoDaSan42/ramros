import * as vscode from 'vscode';
import { TreeItemBase, ToolsFolderItem, BagInfoItem, BagRecordItem, BagFilesFolderItem } from './tree-items';

export class ToolsTreeProvider implements vscode.TreeDataProvider<TreeItemBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemBase | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TreeItemBase | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private bagRecordItem: BagRecordItem | null = null;

  async refresh(): Promise<void> {
    this._onDidChangeTreeData.fire(undefined);
  }
  
  async setBagInfo(info: string, bagPath: string): Promise<void> {
    const bagInfoItem = BagFilesFolderItem.getBagInfoItem();
    if (bagInfoItem) {
      bagInfoItem.setInfo(info, bagPath);
    }
    await this.refresh();
  }
  
  getBagRecordItem(): BagRecordItem {
    if (!this.bagRecordItem) {
      this.bagRecordItem = new BagRecordItem();
    } else if (BagRecordItem.getIsRecording()) {
      // Update the item state if recording is active
      this.bagRecordItem.updateToStopState();
    } else {
      this.bagRecordItem.resetToStartState();
    }
    return this.bagRecordItem;
  }

  getTreeItem(element: TreeItemBase): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItemBase): Promise<TreeItemBase[]> {
    if (!element) {
      const toolsFolder = new ToolsFolderItem();
      return await toolsFolder.getChildren();
    }

    return element.getChildren();
  }

  getParent?(): vscode.ProviderResult<TreeItemBase> {
    return null;
  }
}
