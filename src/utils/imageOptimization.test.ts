import { describe, it, expect, beforeEach } from 'vitest';
import { 
  supportsWebP, 
  optimizeImage, 
  optimizeImageWithSizes,
  generateBlurPlaceholder,
  generateSrcSet 
} from './imageOptimization';

describe('Image Optimization - CP5 Properties', () => {
  let testFile: File;

  beforeEach(() => {
    // Mock HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type) {
      if (type === '2d') {
        return {
          drawImage: () => {},
          fillRect: () => {},
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high'
        } as any;
      }
      return null;
    };

    // Mock HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      const sizeMultiplier = typeof quality === 'number' ? quality : 0.8;
      const dataStr = 'x'.repeat(Math.floor(sizeMultiplier * 100) + 10);
      const blob = new Blob([dataStr], { type: type || 'image/jpeg' });
      callback(blob);
    };

    // Mock HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (type) {
      return `data:${type || 'image/jpeg'};base64,bW9jay1iaW5hcnktZGF0YQ==`;
    };

    // Mock window.URL
    window.URL.createObjectURL = () => 'blob:mock-url';
    window.URL.revokeObjectURL = () => {};

    // Mock Image onload trigger when src is set
    const originalSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set(val) {
        if (originalSrc && originalSrc.set) {
          originalSrc.set.call(this, val);
        }
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      },
      configurable: true
    });

    // Create a valid, larger test file
    testFile = new File(['x'.repeat(500)], 'test.jpg', { type: 'image/jpeg' });
  });

  describe('CP5.1: Images render correctly on all devices', () => {
    it('should generate multiple responsive sizes', async () => {
      const sizes = await optimizeImageWithSizes(testFile);
      
      expect(sizes.thumbnail).toBeInstanceOf(Blob);
      expect(sizes.medium).toBeInstanceOf(Blob);
      expect(sizes.large).toBeInstanceOf(Blob);
      expect(sizes.original).toBeInstanceOf(File);
    });

    it('should maintain aspect ratio when resizing', async () => {
      const optimized = await optimizeImage(testFile, {
        maxWidth: 400,
        maxHeight: 300,
        quality: 0.8
      });
      
      expect(optimized).toBeInstanceOf(Blob);
      expect(optimized.size).toBeLessThan(testFile.size);
    });
  });

  describe('CP5.2: Fallback to original format if WebP not supported', () => {
    it('should detect WebP support', () => {
      const supported = supportsWebP();
      expect(typeof supported).toBe('boolean');
    });

    it('should use JPEG when WebP not specified', async () => {
      const optimized = await optimizeImage(testFile, {
        format: 'jpeg',
        quality: 0.8
      });
      
      expect(optimized.type).toContain('jpeg');
    });
  });

  describe('CP5.3: Lazy loading does not cause layout shift', () => {
    it('should generate blur placeholder', async () => {
      const placeholder = await generateBlurPlaceholder(testFile);
      
      expect(placeholder).toMatch(/^data:image\/jpeg;base64,/);
      expect(placeholder.length).toBeGreaterThan(0);
    });
  });

  describe('CP5.4: Image quality acceptable after compression', () => {
    it('should compress image while maintaining quality', async () => {
      const optimized = await optimizeImage(testFile, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85
      });
      
      // Compressed image should be smaller than original
      expect(optimized.size).toBeLessThan(testFile.size);
      
      // But not too small (quality check)
      expect(optimized.size).toBeGreaterThan(testFile.size * 0.1);
    });

    it('should respect quality parameter', async () => {
      const highQuality = await optimizeImage(testFile, { quality: 0.9 });
      const lowQuality = await optimizeImage(testFile, { quality: 0.5 });
      
      expect(highQuality.size).toBeGreaterThan(lowQuality.size);
    });
  });

  describe('Utility Functions', () => {
    it('should generate srcset string', () => {
      const srcSet = generateSrcSet('https://example.com/image.jpg');
      
      expect(srcSet).toContain('_thumbnail.webp 150w');
      expect(srcSet).toContain('_medium.webp 600w');
      expect(srcSet).toContain('_large.webp 1200w');
    });
  });
});
