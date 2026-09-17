import { logger } from './logger';

// Image moderation fallback. The app deliberately does not send student images
// or provider keys from the browser. Local basicImageDetection still runs where
// it is used; a server moderation workflow can be added later with consent.
export interface ImageModerationResult {
  isAllowed: boolean;
  reason?: string;
  severity: 'safe' | 'warning' | 'blocked';
  categories?: string[];
}

/**
 * This compatibility layer stays fail-open until an explicit, consented server
 * moderation service is configured. It must never expose an AI key to clients.
 */
export const moderateImage = async (imageDataUrl: string): Promise<ImageModerationResult> => {
  void imageDataUrl;
  logger.log('Image moderation uses local checks only; remote moderation is not configured.');
  return {
    isAllowed: true,
    severity: 'safe',
  };
};

export const moderateImages = async (imageDataUrls: string[]): Promise<ImageModerationResult[]> => (
  Promise.all(imageDataUrls.map((image) => moderateImage(image)))
);

export const hasBlockedImage = (results: ImageModerationResult[]): boolean => (
  results.some((result) => !result.isAllowed)
);

export const getBlockedReasons = (results: ImageModerationResult[]): string[] => (
  results
    .filter((result) => !result.isAllowed && result.reason)
    .map((result) => result.reason!)
);
