// Basic Image Detection - Phát hiện ảnh nguy hiểm không cần AI
// Sử dụng Canvas API để phân tích màu sắc và patterns

export interface ImageAnalysis {
  isDangerous: boolean;
  reason?: string;
  confidence: number; // 0-1
  details: {
    darkPixelRatio: number;
    edgeCount: number;
    colorVariance: number;
  };
}

/**
 * Phân tích ảnh để phát hiện nội dung nguy hiểm
 * Dựa trên:
 * - Tỷ lệ pixel tối (súng, vũ khí thường có màu đen/xám)
 * - Số lượng cạnh (vũ khí có nhiều đường thẳng)
 * - Độ tương phản (ảnh bạo lực thường có contrast cao)
 */
export const analyzeImage = async (dataUrl: string): Promise<ImageAnalysis> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Tạo canvas để phân tích
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve({
            isDangerous: false,
            confidence: 0,
            details: { darkPixelRatio: 0, edgeCount: 0, colorVariance: 0 }
          });
          return;
        }
        
        // Resize nhỏ để tăng tốc (100x100 đủ để phân tích)
        canvas.width = 100;
        canvas.height = 100;
        ctx.drawImage(img, 0, 0, 100, 100);
        
        const imageData = ctx.getImageData(0, 0, 100, 100);
        const pixels = imageData.data;
        
        // 1. Tính tỷ lệ pixel tối (đen/xám)
        let darkPixels = 0;
        let totalBrightness = 0;
        const brightnessValues: number[] = [];
        
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          
          // Brightness (0-255)
          const brightness = (r + g + b) / 3;
          brightnessValues.push(brightness);
          totalBrightness += brightness;
          
          // Pixel tối nếu brightness < 80
          if (brightness < 80) {
            darkPixels++;
          }
        }
        
        const totalPixels = pixels.length / 4;
        const darkPixelRatio = darkPixels / totalPixels;
        
        // 2. Tính độ tương phản (variance)
        const avgBrightness = totalBrightness / totalPixels;
        let variance = 0;
        for (const brightness of brightnessValues) {
          variance += Math.pow(brightness - avgBrightness, 2);
        }
        variance = variance / totalPixels;
        const colorVariance = Math.sqrt(variance);
        
        // 3. Đếm số cạnh (edge detection đơn giản)
        let edgeCount = 0;
        for (let i = 0; i < brightnessValues.length - 100; i++) {
          const diff = Math.abs(brightnessValues[i] - brightnessValues[i + 100]);
          if (diff > 50) edgeCount++;
        }
        
        // PHÂN TÍCH KẾT QUẢ
        let isDangerous = false;
        let reason = '';
        let confidence = 0;
        
        // Pattern 1: Ảnh có nhiều vật thể đen + nhiều cạnh = Có thể là súng/vũ khí
        if (darkPixelRatio > 0.3 && edgeCount > 500) {
          isDangerous = true;
          reason = 'Phát hiện nhiều vật thể tối màu với hình dạng sắc nét (có thể là vũ khí)';
          confidence = Math.min(darkPixelRatio * 2 + (edgeCount / 1000), 0.9);
        }
        
        // Pattern 2: Ảnh có contrast rất cao + nhiều pixel đen = Có thể là ảnh bạo lực
        if (colorVariance > 70 && darkPixelRatio > 0.4) {
          isDangerous = true;
          reason = 'Phát hiện độ tương phản cao với nhiều vùng tối (có thể là nội dung bạo lực)';
          confidence = Math.min((colorVariance / 100) + darkPixelRatio, 0.85);
        }
        
        // Pattern 3: Ảnh gần như toàn đen = Có thể là ảnh không phù hợp
        if (darkPixelRatio > 0.7) {
          isDangerous = true;
          reason = 'Ảnh quá tối, có thể chứa nội dung không phù hợp';
          confidence = Math.min(darkPixelRatio, 0.8);
        }
        
        resolve({
          isDangerous,
          reason,
          confidence,
          details: {
            darkPixelRatio: Math.round(darkPixelRatio * 100) / 100,
            edgeCount,
            colorVariance: Math.round(colorVariance)
          }
        });
      } catch (error) {
        console.error('Error analyzing image:', error);
        resolve({
          isDangerous: false,
          confidence: 0,
          details: { darkPixelRatio: 0, edgeCount: 0, colorVariance: 0 }
        });
      }
    };
    
    img.onerror = () => {
      resolve({
        isDangerous: false,
        confidence: 0,
        details: { darkPixelRatio: 0, edgeCount: 0, colorVariance: 0 }
      });
    };
    
    img.src = dataUrl;
  });
};

/**
 * Kiểm tra nhanh ảnh có nguy hiểm không
 */
export const isImageDangerous = async (dataUrl: string): Promise<boolean> => {
  const analysis = await analyzeImage(dataUrl);
  return analysis.isDangerous && analysis.confidence > 0.6;
};

/**
 * Phân tích nhiều ảnh cùng lúc
 */
export const analyzeImages = async (dataUrls: string[]): Promise<ImageAnalysis[]> => {
  return Promise.all(dataUrls.map(url => analyzeImage(url)));
};
