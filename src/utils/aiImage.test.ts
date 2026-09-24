import { describe, expect, it } from 'vitest';
import { parseAIImageDataUrl } from './aiImage';

describe('AI image preparation', () => {
  it('extracts a supported inline image payload', () => {
    expect(parseAIImageDataUrl('data:image/jpeg;base64,aGVsbG8=')).toEqual({
      mimeType: 'image/jpeg',
      data: 'aGVsbG8=',
    });
  });

  it('rejects unsupported or malformed data URLs', () => {
    expect(() => parseAIImageDataUrl('data:image/gif;base64,aGVsbG8=')).toThrow(/JPG, PNG hoặc WebP/);
    expect(() => parseAIImageDataUrl('not-an-image')).toThrow(/Không thể đọc ảnh/);
  });
});
