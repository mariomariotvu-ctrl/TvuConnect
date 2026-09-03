import { logger } from './logger';
// Image Moderation System - Kiểm duyệt ảnh nhạy cảm
// Sử dụng Gemini Vision API để phát hiện nội dung không phù hợp

export interface ImageModerationResult {
  isAllowed: boolean;
  reason?: string;
  severity: 'safe' | 'warning' | 'blocked';
  categories?: string[];
}

/**
 * Kiểm tra ảnh có nội dung nhạy cảm không
 * TẠM THỜI TẮT - Gemini Vision API chưa hỗ trợ free tier
 * Sẽ bật lại khi nâng cấp lên paid plan
 */
export const moderateImage = async (imageDataUrl: string): Promise<ImageModerationResult> => {
  // TẠM THỜI TẮT - Fail-open để không block user
  logger.log('⚠️ Image moderation temporarily disabled (Gemini Vision requires paid plan)');
  return {
    isAllowed: true,
    severity: 'safe'
  };
  
  /* UNCOMMENT KHI NÂNG CẤP LÊN PAID PLAN
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      logger.warn('⚠️ Gemini API key not found, skipping image moderation');
      return {
        isAllowed: true,
        severity: 'safe'
      };
    }

    // Sử dụng gemini-pro-vision (cần paid plan)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Analyze this image for inappropriate content. Check for: nudity, violence, gore, hate speech, illegal content. Reply with JSON only: {"isAllowed": true/false, "severity": "safe"/"blocked", "reason": "reason if blocked"}`
              },
              {
                inline_data: {
                  mime_type: imageDataUrl.split(';')[0].split(':')[1],
                  data: imageDataUrl.split(',')[1]
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
          }
        }),
      }
    );

    if (!response.ok) {
      console.error('❌ Gemini API error:', response.status);
      return {
        isAllowed: true,
        severity: 'safe'
      };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          isAllowed: result.isAllowed !== false,
          severity: result.severity || 'safe',
          reason: result.reason,
          categories: result.categories
        };
      }
    } catch (parseError) {
      logger.warn('⚠️ Could not parse Gemini response, allowing image');
    }

    return {
      isAllowed: true,
      severity: 'safe'
    };

  } catch (error) {
    console.error('❌ Image moderation error:', error);
    return {
      isAllowed: true,
      severity: 'safe'
    };
  }
  */
};

/**
 * Kiểm tra nhiều ảnh cùng lúc
 */
export const moderateImages = async (imageDataUrls: string[]): Promise<ImageModerationResult[]> => {
  const results = await Promise.all(
    imageDataUrls.map(img => moderateImage(img))
  );
  return results;
};

/**
 * Kiểm tra có ảnh nào bị chặn không
 */
export const hasBlockedImage = (results: ImageModerationResult[]): boolean => {
  return results.some(r => !r.isAllowed);
};

/**
 * Lấy lý do bị chặn
 */
export const getBlockedReasons = (results: ImageModerationResult[]): string[] => {
  return results
    .filter(r => !r.isAllowed && r.reason)
    .map(r => r.reason!);
};
