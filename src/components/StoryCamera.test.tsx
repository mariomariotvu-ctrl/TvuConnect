import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryCamera } from './StoryCamera';

const streamStop = vi.fn();
const getUserMedia = vi.fn();
let photoSequence = 0;

beforeEach(() => {
  photoSequence = 0;
  streamStop.mockReset();
  getUserMedia.mockReset().mockResolvedValue({
    getTracks: () => [{ stop: streamStop }],
  });

  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 720 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn().mockReturnValue({ drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn() }),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: vi.fn((callback: BlobCallback) => callback(new Blob(['photo'], { type: 'image/jpeg' }))),
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:story-${++photoSequence}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StoryCamera', () => {
  it('captures more than one photo and lets the user delete a photo', async () => {
    const onDone = vi.fn();
    render(
      <StoryCamera
        multiple
        maxFiles={3}
        onClose={vi.fn()}
        onDone={onDone}
        onPickFromLibrary={vi.fn()}
      />,
    );

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Chụp ảnh' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dùng 1 ảnh' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Chụp thêm' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chụp thêm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chụp ảnh' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dùng 2 ảnh' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xoá ảnh 1' }));
    expect(screen.getByRole('button', { name: 'Dùng 1 ảnh' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dùng 1 ảnh' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0]).toHaveLength(1);
  });

  it('offers a gallery fallback when the camera never responds', async () => {
    vi.useFakeTimers();
    getUserMedia.mockReturnValueOnce(new Promise(() => undefined));

    render(
      <StoryCamera
        onClose={vi.fn()}
        onDone={vi.fn()}
        onPickFromLibrary={vi.fn()}
      />,
    );

    expect(screen.getByText('Đang mở camera…')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(screen.getByText(/Camera chưa phản hồi/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chọn ảnh có sẵn/i })).toBeInTheDocument();
  });
});
