/**
 * Shared webview panel for the structured message input forms.
 *
 * Panel semantics (per design spec): one panel per window; re-triggering the
 * same target reveals the existing panel and keeps the entered values,
 * triggering a different target replaces the panel content with fresh
 * defaults.
 */

import * as vscode from 'vscode';
import { FormKind } from '../core/form-html';

export interface MessageInputTarget {
  /** Registry key, e.g. `topic:/chatter` or `service:/add`. */
  key: string;
  /** Panel title (shows the target). */
  title: string;
  kind: FormKind;
  html: string;
  /**
   * Called for incoming webview messages. Returning a result object posts it
   * to the webview; throwing shows an error notification and posts a failure
   * result (the panel stays open either way).
   */
  onMessage: (message: MessageInputCommand) => Promise<{ type: string; ok: boolean; message: string } | void>;
}

export interface MessageInputCommand {
  type?: string;
  values?: Record<string, string>;
  rate?: number;
}

interface RegisteredPanel {
  panel: vscode.WebviewPanel;
  key: string;
  subscription: vscode.Disposable;
}

let registered: RegisteredPanel | undefined;

/**
 * Shows the structured input form for the given target: reveals an existing
 * panel for the same target, replaces the content when the target changed.
 */
export function showMessageInputPanel(target: MessageInputTarget): void {
  if (registered && registered.key === target.key) {
    registered.panel.reveal();
    return;
  }

  if (registered) {
    registered.subscription.dispose();
    registered.panel.dispose();
    registered = undefined;
  }

  const panel = vscode.window.createWebviewPanel(
    'ramros.messageInput',
    target.title,
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );
  panel.webview.html = target.html;

  const subscription = panel.webview.onDidReceiveMessage((message: MessageInputCommand) =>
    dispatchMessage(target, panel, message)
  );
  panel.onDidDispose(() => {
    if (registered && registered.panel === panel) {
      registered = undefined;
    }
  });

  registered = { panel, key: target.key, subscription };
  panel.reveal();
}

function dispatchMessage(
  target: MessageInputTarget,
  panel: vscode.WebviewPanel,
  message: MessageInputCommand
): Promise<void> {
  // Only known message types are forwarded; unknown types are ignored so a
  // compromised or buggy webview cannot trigger unexpected handler paths.
  const knownTypes = ['publishRate', 'publishOnce', 'call'];
  if (message.type !== undefined && !knownTypes.includes(message.type)) {
    return Promise.resolve();
  }
  return target
    .onMessage(message)
    .then(result => {
      // Handler results post to the webview; undefined = no status update.
      if (result) {
        void panel.webview.postMessage(result);
      }
    })
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(messageText);
      void panel.webview.postMessage({ type: 'result', ok: false, message: messageText });
    });
}

/** Test seam: forgets the registered panel between tests. */
export function __resetMessageInputPanelForTests(): void {
  if (registered) {
    registered.subscription.dispose();
    registered.panel.dispose();
    registered = undefined;
  }
}
