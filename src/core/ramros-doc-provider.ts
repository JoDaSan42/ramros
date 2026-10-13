import * as vscode from 'vscode';

export class RamrosDocProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'ramros-doc';

  private readonly contents = new Map<string, string>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange: vscode.Event<vscode.Uri> = this.onDidChangeEmitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.path) ?? '';
  }

  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.path, content);
    this.onDidChangeEmitter.fire(uri);
  }

  static docUri(key: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: RamrosDocProvider.scheme,
      path: '/' + key.replace(/^\/+/, '')
    });
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

export async function showInReadonlyDoc(
  provider: RamrosDocProvider,
  key: string,
  content: string
): Promise<void> {
  const uri = RamrosDocProvider.docUri(key);
  provider.set(uri, content);
  await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: false });
}
