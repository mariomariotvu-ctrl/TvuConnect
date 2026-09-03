// Image Optimization Utility with WebP support and responsive sizes

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

export interface ImageSizes {
  thumbnail: Blob;  // 150x150
  medium: Blob;     // 600x600
  large: Blob;      // 1200x1200
  original: Blob;
}

export interface ResponsiveSizes {
  thumbnail: string;  // Base64 data URL
  medium: string;
  large: string;
  original: string;
}

// Check if browser supports WebP
export const supportsWebP = (): boolean => {
  try {
    const canvas = window.document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const dataUrl = canvas.toDataURL('image/webp');
    return dataUrl ? dataUrl.indexOf('data:image/webp') === 0 : false;
  } catch (e) {
    return false;
  }
};

// Load image from file
const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Resize image to specific dimensions
const resizeImage = (
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    let { width, height } = img;

    // Calculate new dimensions maintaining aspect ratio
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw image
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob (JPEG format)
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/jpeg',
      quality
    );
  });
};

// Convert blob to WebP format
const convertToWebP = (blob: Blob, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob) {
            resolve(webpBlob);
          } else {
            reject(new Error('Failed to convert to WebP'));
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for WebP conversion'));
    };

    img.src = url;
  });
};

// Generate blur placeholder (tiny base64 image)
export const generateBlurPlaceholder = async (file: File): Promise<string> => {
  const img = await loadImage(file);
  
  // Create tiny canvas (20x20)
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 20;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  ctx.drawImage(img, 0, 0, 20, 20);
  
  // Return as base64 data URL with low quality
  return canvas.toDataURL('image/jpeg', 0.1);
};

// Optimize image with multiple responsive sizes
export const optimizeImageWithSizes = async (file: File): Promise<ImageSizes> => {
  const img = await loadImage(file);
  
  // Generate different sizes
  const thumbnail = await resizeImage(img, 150, 150, 0.8);
  const medium = await resizeImage(img, 600, 600, 0.85);
  const large = await resizeImage(img, 1200, 1200, 0.9);
  
  // Convert to WebP if supported
  if (supportsWebP()) {
    return {
      thumbnail: await convertToWebP(thumbnail, 0.8),
      medium: await convertToWebP(medium, 0.85),
      large: await convertToWebP(large, 0.9),
      original: file
    };
  }
  
  // Return JPEG versions if WebP not supported
  return {
    thumbnail,
    medium,
    large,
    original: file
  };
};

// Legacy function - kept for backward compatibility
export const optimizeImage = async (
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<Blob> => {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    format = supportsWebP() ? 'webp' : 'jpeg'
  } = options;

  const img = await loadImage(file);
  const resized = await resizeImage(img, maxWidth, maxHeight, quality);
  
  if (format === 'webp' && supportsWebP()) {
    return convertToWebP(resized, quality);
  }
  
  return resized;
};

// Generate srcset string for responsive images
export const generateSrcSet = (baseUrl: string): string => {
  // Assume URLs follow pattern: baseUrl_thumbnail.webp, baseUrl_medium.webp, etc.
  const basePath = baseUrl.replace(/\.[^/.]+$/, ''); // Remove extension
  return `
    ${basePath}_thumbnail.webp 150w,
    ${basePath}_medium.webp 600w,
    ${basePath}_large.webp 1200w,
    ${baseUrl} 1920w
  `.trim();
};
