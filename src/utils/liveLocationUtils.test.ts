import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_LOCATION_INTERVAL_MS,
  LOCATION_KEEP_ALIVE_MS,
  NORMAL_LOCATION_INTERVAL_MS,
  shouldSendLivePosition,
  type LivePositionSample,
} from './liveLocationUtils';

const previous: LivePositionSample = {
  latitude: 9.9345,
  longitude: 106.3461,
  accuracy: 8,
  sentAt: 1_000,
};

describe('live location update cadence', () => {
  it('gửi ngay điểm đầu tiên', () => {
    expect(shouldSendLivePosition(null, previous, 1_000, false)).toBe(true);
  });

  it('không gửi dồn dập khi mới di chuyển', () => {
    const next = { ...previous, latitude: previous.latitude + 0.0003 };
    expect(shouldSendLivePosition(
      previous,
      next,
      previous.sentAt + NORMAL_LOCATION_INTERVAL_MS - 1,
      false,
    )).toBe(false);
  });

  it('gửi chuyển động khoảng 7 m sau thời gian tối thiểu', () => {
    const next = { ...previous, latitude: previous.latitude + 0.000065 };
    expect(shouldSendLivePosition(
      previous,
      next,
      previous.sentAt + NORMAL_LOCATION_INTERVAL_MS,
      false,
    )).toBe(true);
  });

  it('chế độ chạm mặt cập nhật sớm hơn khi di chuyển khoảng 5 m', () => {
    const next = { ...previous, latitude: previous.latitude + 0.000045 };
    expect(shouldSendLivePosition(
      previous,
      next,
      previous.sentAt + ENCOUNTER_LOCATION_INTERVAL_MS,
      true,
    )).toBe(true);
  });

  it('vẫn gửi nhịp duy trì khi người dùng đứng yên', () => {
    expect(shouldSendLivePosition(
      previous,
      previous,
      previous.sentAt + LOCATION_KEEP_ALIVE_MS,
      false,
    )).toBe(true);
  });
});
