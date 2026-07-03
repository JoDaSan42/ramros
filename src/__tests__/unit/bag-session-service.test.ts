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
});
