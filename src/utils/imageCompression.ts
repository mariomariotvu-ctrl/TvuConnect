import { logger } from './logger';
/**
 * Image Compression Utility - ENHANCED VERSION
 * High-quality compression with smart algorithms
 */

export interface CompressedImage {
  dataUrl: string;
  size: number; // in bytes
  width: number;
  height: number;
  originalSize: number;
  compressionRatio: number;
}

/**
 * Compress and resize an image file with HIGH QUALITY
 * @param file - Image file from input
 * @param maxWidth - Maximum width (default: 1200px for posts, 400px for avatars)
 * @param maxHeight - Maximum height (default: 1200px)
 * @param quality - JPEG quality 0-1 (default: 0.92 for high quality)
 * @returns Compressed image as data URL
 */
export const compressImage = async (
  file: File,
  maxWidth: number = 1200,
  maxHeight: number = 1200,
  initialQuality: number = 0.92,
  cropToSquare: boolean = false,
  maxSizeKB: number = 100 // Mục tiêu dung lượng tối đa (mặc định 100KB cho ảnh đại diện)
): Promise<CompressedImage> => {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      reject(new Error('File không phải là ảnh'));
      return;
    }

    // Cho phép ảnh lên đến 50MB (các điện thoại hiện nay chụp ảnh rất lớn)
    if (file.size > 50 * 1024 * 1024) {
      reject(new Error('Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 50MB'));
      return;
    }

    // Sử dụng URL.createObjectURL thay cho FileReader để tránh bị tràn RAM (crash memory)
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      // Giải phóng bộ nhớ ngay sau khi ảnh đã load xong
      URL.revokeObjectURL(objectUrl);
      
      let sWidth = img.width;
      let sHeight = img.height;
      let sX = 0;
      let sY = 0;
      
      let width = img.width;
      let height = img.height;
      
      if (cropToSquare) {
        // Center-crop to square
        const minDim = Math.min(sWidth, sHeight);
        sX = (sWidth - minDim) / 2;
        sY = (sHeight - minDim) / 2;
        sWidth = minDim;
        sHeight = minDim;
        
        width = Math.min(maxWidth, maxHeight, minDim);
        height = width;
      } else {
        // Normal resize maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;
          
          if (width > height) {
            width = maxWidth;
            height = Math.round(maxWidth / aspectRatio);
          } else {
            height = maxHeight;
            width = Math.round(maxHeight * aspectRatio);
          }
        }
      }
      
      // Create canvas with HIGH QUALITY settings
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d', {
        alpha: false, // Disable alpha for better JPEG compression
        desynchronized: false,
        willReadFrequently: false
      });
      
      if (!ctx) {
        reject(new Error('Không thể xử lý ảnh'));
        return;
      }
      
      // Enable HIGH QUALITY rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Fill white background (for transparent images)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Kỹ thuật step-down scaling: Giảm kích thước theo từng bước để ảnh mượt hơn và tránh lỗi với ảnh cực lớn
      const isExtremelyLarge = sWidth > width * 3 || sHeight > height * 3;
      
      if (isExtremelyLarge && !cropToSquare) {
        let tempWidth = img.width / 2;
        let tempHeight = img.height / 2;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = tempWidth;
        tempCanvas.height = tempHeight;
        const tempCtx = tempCanvas.getContext('2d', { alpha: false });
        
        if (tempCtx) {
          tempCtx.fillStyle = '#FFFFFF';
          tempCtx.fillRect(0, 0, tempWidth, tempHeight);
          tempCtx.drawImage(img, 0, 0, tempWidth, tempHeight);
          
          while (tempWidth / 2 > width * 1.5) {
            tempCtx.drawImage(tempCanvas, 0, 0, tempWidth, tempHeight, 0, 0, tempWidth / 2, tempHeight / 2);
            tempWidth /= 2;
            tempHeight /= 2;
          }
          ctx.drawImage(tempCanvas, 0, 0, tempWidth, tempHeight, 0, 0, width, height);
        } else {
          ctx.drawImage(img, 0, 0, width, height);
        }
      } else {
        if (cropToSquare) {
          ctx.drawImage(img, sX, sY, sWidth, sHeight, 0, 0, width, height);
        } else {
          ctx.drawImage(img, 0, 0, width, height);
        }
      }
      
      // Apply sharpening filter for better clarity
      if (width < img.width * 0.8) {
        // Only sharpen if significantly resized
        applySharpenFilter(ctx, width, height);
      }
      
      // Khởi tạo vòng lặp ép dung lượng (Dynamic Quality Adjustment)
      let quality = initialQuality;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      let size = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);
      
      const MAX_TARGET_BYTES = maxSizeKB * 1024;
      let attempts = 0;
      
      // Nếu ảnh vẫn còn lớn, tự động hạ chất lượng xuống từ từ để ép vừa vặn
      while (size > MAX_TARGET_BYTES && quality > 0.4 && attempts < 5) {
        quality -= 0.1;
        attempts++;
        
        // Cố gắng giảm cả khía cạnh nhỏ nếu chất lượng đã xuống tối thiểu
        if (attempts === 3 && size > MAX_TARGET_BYTES * 1.5) {
            width = Math.max(width * 0.8, 300);
            height = Math.max(height * 0.8, 300);
            
            const newCanvas = document.createElement('canvas');
            newCanvas.width = width;
            newCanvas.height = height;
            const newCtx = newCanvas.getContext('2d', { alpha: false });
            if (newCtx) {
               newCtx.imageSmoothingEnabled = true;
               newCtx.imageSmoothingQuality = 'high';
               newCtx.fillStyle = '#FFFFFF';
               newCtx.fillRect(0, 0, width, height);
               newCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);
               
               ctx.canvas.width = width;
               ctx.canvas.height = height;
               ctx.drawImage(newCanvas, 0, 0);
            }
        }
        
        dataUrl = ctx.canvas.toDataURL('image/jpeg', quality);
        size = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);
      }
      
      const compressionRatio = ((1 - size / file.size) * 100).toFixed(1);
      
      resolve({
        dataUrl,
        size,
        width: Math.round(width),
        height: Math.round(height),
        originalSize: file.size,
        compressionRatio: parseFloat(compressionRatio)
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể đọc ảnh, vùi lòng chọn ảnh khác.'));
    };
    
    img.src = objectUrl;
  });
};

/**
 * Apply sharpening filter to improve image clarity after resize
 */
const applySharpenFilter = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Sharpening kernel (subtle)
    const sharpenKernel = [
      0, -0.15, 0,
      -0.15, 1.6, -0.15,
      0, -0.15, 0
    ];
    
    const tempData = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // RGB only, skip alpha
          let sum = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              const kernelIdx = (ky + 1) * 3 + (kx + 1);
              sum += tempData[idx] * sharpenKernel[kernelIdx];
            }
          }
          
          const idx = (y * width + x) * 4 + c;
          data[idx] = Math.max(0, Math.min(255, sum));
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  } catch (error) {
    // Silently fail if sharpening doesn't work
    logger.warn('Sharpening filter failed:', error);
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

/**
 * Validate image dimensions
 */
export const validateImageDimensions = (
  width: number,
  height: number,
  minWidth: number = 100,
  minHeight: number = 100
): boolean => {
  return width >= minWidth && height >= minHeight;
};
