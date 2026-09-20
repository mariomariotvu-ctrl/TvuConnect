import { describe, expect, it } from 'vitest';
import {
  classifyCallQuality,
  formatCallDuration,
  getCallMediaConstraints,
} from './callMedia';

describe('call media profile', () => {
  it('uses HD video without forcing heavy full-HD capture', () => {
    const constraints = getCallMediaConstraints(true, 'user', { effectiveType: '4g' });
    const video = constraints.video as MediaTrackConstraints;
    expect(video.width).toEqual({ ideal: 1_280, max: 1_280 });
    expect(video.height).toEqual({ ideal: 720, max: 720 });
    expect(video.frameRate).toEqual({ ideal: 24, max: 30 });
    expect(constraints.audio).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it('reduces capture pressure when data saver or a slow network is active', () => {
    const constraints = getCallMediaConstraints(true, 'environment', { saveData: true });
    const video = constraints.video as MediaTrackConstraints;
    expect(video.width).toEqual({ ideal: 640, max: 1_280 });
    expect(video.frameRate).toEqual({ ideal: 18, max: 20 });
  });

  it('classifies connection quality from loss, latency and bitrate', () => {
    expect(classifyCallQuality({ roundTripTimeSeconds: 0.08, availableOutgoingBitrate: 900_000 })).toBe('good');
    expect(classifyCallQuality({ roundTripTimeSeconds: 0.35, packetsLost: 2, packetsReceived: 100 })).toBe('fair');
    expect(classifyCallQuality({ packetsLost: 10, packetsReceived: 80 })).toBe('poor');
  });

  it('formats short and long call durations', () => {
    expect(formatCallDuration(65)).toBe('01:05');
    expect(formatCallDuration(3_665)).toBe('01:01:05');
  });
});
