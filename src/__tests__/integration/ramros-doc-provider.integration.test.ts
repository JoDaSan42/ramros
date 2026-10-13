import * as vscode from 'vscode';
import { RamrosDocProvider, showInReadonlyDoc } from '../../core/ramros-doc-provider';

describe('RamrosDocProvider Integration Tests', () => {
  let provider: RamrosDocProvider;

  beforeEach(() => {
    provider = new RamrosDocProvider();
  });

  describe('provideTextDocumentContent', () => {
    it('returns stored content', () => {
      const uri = RamrosDocProvider.docUri('service-call//reset');
      provider.set(uri, 'output content');

      expect(provider.provideTextDocumentContent(uri)).toBe('output content');
    });

    it('returns empty string for unknown URI path', () => {
      const uri = RamrosDocProvider.docUri('unknown');

      expect(provider.provideTextDocumentContent(uri)).toBe('');
    });
  });

  describe('set', () => {
    it('overwrites previously stored content', () => {
      const uri = RamrosDocProvider.docUri('service-call//reset');
      provider.set(uri, 'first');
      provider.set(uri, 'second');

      expect(provider.provideTextDocumentContent(uri)).toBe('second');
    });

    it('fires onDidChange', () => {
      const listener = jest.fn();
      provider.onDidChange(listener);

      const uri = RamrosDocProvider.docUri('service-call//reset');
      provider.set(uri, 'content');

      expect(listener).toHaveBeenCalledWith(uri);
    });
  });

  describe('docUri', () => {
    it('produces a ramros-doc scheme URI', () => {
      const uri = RamrosDocProvider.docUri('service-call//reset');

      expect(uri.scheme).toBe('ramros-doc');
    });

    it('round-trips through the provider (set then read)', () => {
      const uri = RamrosDocProvider.docUri('service-call//reset');
      provider.set(uri, 'round-tripped');

      expect(provider.provideTextDocumentContent(uri)).toBe('round-tripped');
    });
  });

  describe('showInReadonlyDoc', () => {
    it('stores content and opens the document', async () => {
      await showInReadonlyDoc(provider, 'service-call//reset', 'shown content');

      expect(provider.provideTextDocumentContent(RamrosDocProvider.docUri('service-call//reset'))).toBe('shown content');
      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
        RamrosDocProvider.docUri('service-call//reset'),
        { preview: true, preserveFocus: false }
      );
    });
  });
});
