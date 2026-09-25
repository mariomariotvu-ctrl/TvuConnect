import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallPrompt, type BeforeInstallPromptEvent } from './InstallPrompt';
import { APP_INSTALL_REQUEST_EVENT } from '../utils/platform';

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    window.__tvuInstallPrompt = null;
  });

  it('opens the native installer from a single app download click', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    window.__tvuInstallPrompt = {
      preventDefault: vi.fn(),
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    render(<InstallPrompt />);
    fireEvent(window, new CustomEvent(APP_INSTALL_REQUEST_EVENT));

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  });

  it('never shows the old passive acknowledgement button', () => {
    render(<InstallPrompt />);
    fireEvent(window, new CustomEvent(APP_INSTALL_REQUEST_EVENT));

    expect(document.body).not.toHaveTextContent('Đã hiểu');
  });
});
