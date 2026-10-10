import { BagSessionService } from '../../executor/bag-session-service';

describe('BagSessionService', () => {
  let service: BagSessionService;

  beforeEach(() => {
    service = new BagSessionService();
  });

  afterEach(() => {
    service.dispose();
  });

  describe('recording state', () => {
    it('starts with no recording', () => {
      expect(service.isRecording).toBe(false);
      expect(service.recordingTerminal).toBeNull();
      expect(service.isRecordingPaused).toBe(false);
    });

    it('tracks recording terminal', () => {
      const mockTerminal = { dispose: jest.fn() } as any;
      service.setRecordingTerminal(mockTerminal);
      expect(service.isRecording).toBe(true);
      expect(service.recordingTerminal).toBe(mockTerminal);
    });

    it('resets paused state when terminal is cleared', () => {
      const mockTerminal = { dispose: jest.fn() } as any;
      service.setRecordingTerminal(mockTerminal);
      service.toggleRecordingPause();
      expect(service.isRecordingPaused).toBe(true);

      service.setRecordingTerminal(null);
      expect(service.isRecording).toBe(false);
      expect(service.isRecordingPaused).toBe(false);
    });

    it('toggles pause state', () => {
      const mockTerminal = { dispose: jest.fn() } as any;
      service.setRecordingTerminal(mockTerminal);

      expect(service.toggleRecordingPause()).toBe(true);
      expect(service.isRecordingPaused).toBe(true);

      expect(service.toggleRecordingPause()).toBe(false);
      expect(service.isRecordingPaused).toBe(false);
    });
  });

  describe('playback state', () => {
    it('starts with no playback', () => {
      expect(service.isPlaying).toBe(false);
      expect(service.playbackTerminal).toBeNull();
      expect(service.isPlaybackPaused).toBe(false);
      expect(service.isPlaybackLooping).toBe(false);
    });

    it('tracks playback terminal', () => {
      const mockTerminal = { dispose: jest.fn() } as any;
      service.setPlaybackTerminal(mockTerminal);
      expect(service.isPlaying).toBe(true);
      expect(service.playbackTerminal).toBe(mockTerminal);
    });

    it('toggles playback pause', () => {
      const mockTerminal = { dispose: jest.fn() } as any;
      service.setPlaybackTerminal(mockTerminal);

      expect(service.togglePlaybackPause()).toBe(true);
      expect(service.isPlaybackPaused).toBe(true);

      expect(service.togglePlaybackPause()).toBe(false);
      expect(service.isPlaybackPaused).toBe(false);
    });

    it('toggles playback loop', () => {
      expect(service.togglePlaybackLoop()).toBe(true);
      expect(service.isPlaybackLooping).toBe(true);

      expect(service.togglePlaybackLoop()).toBe(false);
      expect(service.isPlaybackLooping).toBe(false);
    });

    it('sets playback looping directly', () => {
      service.setPlaybackLooping(true);
      expect(service.isPlaybackLooping).toBe(true);
      service.setPlaybackLooping(false);
      expect(service.isPlaybackLooping).toBe(false);
    });
  });

  describe('selected bag path', () => {
    it('starts with no selected bag', () => {
      expect(service.selectedBagPath).toBeNull();
    });

    it('tracks selected bag path', () => {
      service.setSelectedBagPath('/path/to/bag');
      expect(service.selectedBagPath).toBe('/path/to/bag');

      service.setSelectedBagPath(null);
      expect(service.selectedBagPath).toBeNull();
    });
  });

  describe('dispose', () => {
    it('disposes terminals on dispose', () => {
      const mockRecTerminal = { dispose: jest.fn() } as any;
      const mockPlayTerminal = { dispose: jest.fn() } as any;
      service.setRecordingTerminal(mockRecTerminal);
      service.setPlaybackTerminal(mockPlayTerminal);

      service.dispose();

      expect(mockRecTerminal.dispose).toHaveBeenCalled();
      expect(mockPlayTerminal.dispose).toHaveBeenCalled();
      expect(service.isRecording).toBe(false);
      expect(service.isPlaying).toBe(false);
    });
  });

  describe('handleTerminalClosed', () => {
    it('resets recording state when the recording terminal closes', () => {
      const mockTerminal = { dispose: jest.fn(), sendText: jest.fn() } as any;
      service.setRecordingTerminal(mockTerminal);
      const handled = service.handleTerminalClosed(mockTerminal);
      expect(handled).toBe(true);
      expect(service.isRecording).toBe(false);
      expect(service.isRecordingPaused).toBe(false);
    });

    it('resets playback state when the playback terminal closes', () => {
      const mockTerminal = { dispose: jest.fn(), sendText: jest.fn() } as any;
      service.setPlaybackTerminal(mockTerminal);
      service.setPlaybackPaused(true);
      const handled = service.handleTerminalClosed(mockTerminal);
      expect(handled).toBe(true);
      expect(service.isPlaying).toBe(false);
      expect(service.isPlaybackPaused).toBe(false);
    });

    it('ignores unrelated terminals', () => {
      const recording = { dispose: jest.fn(), sendText: jest.fn() } as any;
      service.setRecordingTerminal(recording);
      const other = { dispose: jest.fn() } as any;
      expect(service.handleTerminalClosed(other)).toBe(false);
      expect(service.isRecording).toBe(true);
      service.setRecordingTerminal(null);
    });
  });

  describe('stopRecordingAsync / stopPlaybackAsync', () => {
    it('sends SIGINT and waits before disposing the recording terminal', async () => {
      const mockTerminal = { dispose: jest.fn(), sendText: jest.fn() } as any;
      service.setRecordingTerminal(mockTerminal);
      await service.stopRecordingAsync();
      expect(mockTerminal.sendText).toHaveBeenCalledWith('\x03');
      expect(mockTerminal.dispose).toHaveBeenCalled();
      expect(service.isRecording).toBe(false);
    });

    it('sends SIGINT and waits before disposing the playback terminal', async () => {
      const mockTerminal = { dispose: jest.fn(), sendText: jest.fn() } as any;
      service.setPlaybackTerminal(mockTerminal);
      await service.stopPlaybackAsync();
      expect(mockTerminal.sendText).toHaveBeenCalledWith('\x03');
      expect(mockTerminal.dispose).toHaveBeenCalled();
      expect(service.isPlaying).toBe(false);
    });

    it('is a no-op without an active recording terminal', async () => {
      await expect(service.stopRecordingAsync()).resolves.toBeUndefined();
      await expect(service.stopPlaybackAsync()).resolves.toBeUndefined();
    });
  });
});
