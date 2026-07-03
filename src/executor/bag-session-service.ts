import * as vscode from 'vscode';

export class BagSessionService implements vscode.Disposable {
  private _recordingTerminal: vscode.Terminal | null = null;
  private _recordingPaused = false;
  private _playbackTerminal: vscode.Terminal | null = null;
  private _playbackPaused = false;
  private _playbackLooping = false;
  private _selectedBagPath: string | null = null;

  get recordingTerminal(): vscode.Terminal | null {
    return this._recordingTerminal;
  }

  get isRecording(): boolean {
    return this._recordingTerminal !== null;
  }

  get isRecordingPaused(): boolean {
    return this._recordingPaused;
  }

  setRecordingTerminal(terminal: vscode.Terminal | null): void {
    this._recordingTerminal = terminal;
    if (terminal === null) {
      this._recordingPaused = false;
    }
  }

  toggleRecordingPause(): boolean {
    this._recordingPaused = !this._recordingPaused;
    return this._recordingPaused;
  }

  get playbackTerminal(): vscode.Terminal | null {
    return this._playbackTerminal;
  }

  get isPlaying(): boolean {
    return this._playbackTerminal !== null;
  }

  get isPlaybackPaused(): boolean {
    return this._playbackPaused;
  }

  get isPlaybackLooping(): boolean {
    return this._playbackLooping;
  }

  setPlaybackTerminal(terminal: vscode.Terminal | null): void {
    this._playbackTerminal = terminal;
    if (terminal === null) {
      this._playbackPaused = false;
    }
  }

  togglePlaybackPause(): boolean {
    this._playbackPaused = !this._playbackPaused;
    return this._playbackPaused;
  }

  togglePlaybackLoop(): boolean {
    this._playbackLooping = !this._playbackLooping;
    return this._playbackLooping;
  }

  setPlaybackLooping(looping: boolean): void {
    this._playbackLooping = looping;
  }

  get selectedBagPath(): string | null {
    return this._selectedBagPath;
  }

  setSelectedBagPath(bagPath: string | null): void {
    this._selectedBagPath = bagPath;
  }

  dispose(): void {
    if (this._recordingTerminal) {
      this._recordingTerminal.dispose();
      this._recordingTerminal = null;
    }
    if (this._playbackTerminal) {
      this._playbackTerminal.dispose();
      this._playbackTerminal = null;
    }
  }
}
