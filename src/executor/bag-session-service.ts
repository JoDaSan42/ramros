import * as vscode from 'vscode';

// SIGINT needs a moment to reach ros2 bag before the terminal is torn down,
// otherwise the recording may not finalize cleanly.
const SIGINT_SETTLE_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BagSessionService implements vscode.Disposable {
  private static instance: BagSessionService | undefined;

  static getInstance(): BagSessionService {
    if (!BagSessionService.instance) {
      BagSessionService.instance = new BagSessionService();
    }
    return BagSessionService.instance;
  }

  private _recordingTerminal: vscode.Terminal | null = null;
  private _recordingPaused = false;
  private _playbackTerminal: vscode.Terminal | null = null;
  private _playbackPaused = false;
  private _playbackLooping = false;
  private _selectedBagPath: string | null = null;
  private _bagInfoText = 'No bag file selected';
  private _bagInfoPath: string | null = null;

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

  setRecordingPaused(paused: boolean): void {
    this._recordingPaused = paused;
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

  setPlaybackPaused(paused: boolean): void {
    this._playbackPaused = paused;
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

  get bagInfoText(): string {
    return this._bagInfoText;
  }

  get bagInfoPath(): string | null {
    return this._bagInfoPath;
  }

  setBagInfo(info: string, bagPath: string): void {
    this._bagInfoText = info;
    this._bagInfoPath = bagPath;
  }

  clearBagInfo(): void {
    this._bagInfoText = 'No bag file selected';
    this._bagInfoPath = null;
  }

  handleTerminalClosed(terminal: vscode.Terminal): boolean {
    if (terminal === this._recordingTerminal) {
      this._recordingTerminal = null;
      this._recordingPaused = false;
      return true;
    }
    if (terminal === this._playbackTerminal) {
      this._playbackTerminal = null;
      this._playbackPaused = false;
      return true;
    }
    return false;
  }

  async stopRecordingAsync(): Promise<void> {
    const terminal = this._recordingTerminal;
    if (!terminal) return;
    terminal.sendText('\x03');
    await delay(SIGINT_SETTLE_MS);
    this._recordingTerminal = null;
    this._recordingPaused = false;
    terminal.dispose();
  }

  async stopPlaybackAsync(): Promise<void> {
    const terminal = this._playbackTerminal;
    if (!terminal) return;
    terminal.sendText('\x03');
    await delay(SIGINT_SETTLE_MS);
    this._playbackTerminal = null;
    this._playbackPaused = false;
    terminal.dispose();
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
