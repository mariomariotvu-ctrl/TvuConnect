import { compressImage } from './imageCompression';
import type { StudentAssistantImage } from './geminiAI';

const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;

export interface PreparedAIImage extends StudentAssistantImage {
  name: string;
  previewUrl: string;
}

export function parseAIImageDataUrl(dataUrl: string): StudentAssistantImage {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Không thể đọc ảnh này. Hãy chọn ảnh JPG, PNG hoặc WebP.');

  return {
    mimeType: match[1] as StudentAssistantImage['mimeType'],
    data: match[2],
  };
}

export async function prepareImageForAI(file: File): Promise<PreparedAIImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File đã chọn không phải là ảnh.');
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 50 MB.');
  }

  // A page photographed on a modern phone is usually several megabytes.
  // Resize it before calling Firebase so OCR stays sharp without a heavy upload.
  const compressed = await compressImage(file, 1_600, 1_600, 0.9, false, 1_200);
  const image = parseAIImageDataUrl(compressed.dataUrl);

  return {
    ...image,
    name: file.name || 'Ảnh trang sách',
    previewUrl: compressed.dataUrl,
  };
}
