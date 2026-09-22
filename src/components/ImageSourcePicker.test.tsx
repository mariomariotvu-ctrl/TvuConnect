import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageSourcePicker } from './ImageSourcePicker';
import { APP_INSTALL_REQUEST_EVENT } from '../utils/platform';

const renderPicker = (onFilesSelected = vi.fn()) => render(
  <ImageSourcePicker title="Ảnh kiểm thử" multiple onFilesSelected={onFilesSelected}>
    {(open) => <button onClick={open}>Mở ảnh</button>}
  </ImageSourcePicker>,
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ImageSourcePicker', () => {
  it('offers gallery and camera separately on Android', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Mở ảnh' }));

    expect(screen.getByText('Chọn ảnh có sẵn')).toBeInTheDocument();
    expect(screen.getByText('Không cần quyền camera')).toBeInTheDocument();
    expect(screen.getByText('Chụp ảnh mới')).toBeInTheDocument();
    expect(document.querySelector('input[capture="environment"]')).toBeInTheDocument();
  });

  it('passes selected gallery files to the upload flow', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const onFilesSelected = vi.fn();

    renderPicker(onFilesSelected);
    fireEvent.click(screen.getByRole('button', { name: 'Mở ảnh' }));
    const input = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onFilesSelected).toHaveBeenCalledWith([file]));
    expect(screen.queryByRole('heading', { name: 'Ảnh kiểm thử' })).not.toBeInTheDocument();
  });

  it('shows platform permission help and can request the install guide', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const installRequest = vi.fn();
    window.addEventListener(APP_INSTALL_REQUEST_EVENT, installRequest, { once: true });

    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Mở ảnh' }));
    fireEvent.click(screen.getByRole('button', { name: /bị từ chối quyền/i }));

    expect(screen.getByText(/Cài đặt → Ứng dụng → Chrome hoặc TVU Connect/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cài TVU Connect như ứng dụng' }));
    expect(installRequest).toHaveBeenCalledOnce();
  });
});
