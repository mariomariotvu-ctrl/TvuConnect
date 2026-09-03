import { URLValidation, URLSecurityResult } from '../types/documentLink';

/**
 * Trusted domains for document URLs
 * Expanded list to include common file sharing and educational platforms
 */
export const TRUSTED_DOMAINS = [
  // Google Services
  'drive.google.com',
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
  'forms.google.com',
  
  // Microsoft Services
  'onedrive.live.com',
  '1drv.ms',
  'sharepoint.com',
  
  // Cloud Storage
  'dropbox.com',
  'db.tt',
  'box.com',
  'mega.nz',
  'mediafire.com',
  
  // Development & Education
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  
  // Vietnamese Educational Domains
  'tvu.edu.vn',
  'ydmekong.edu.vn',
  'edu.vn',
  
  // Document Platforms
  'scribd.com',
  'issuu.com',
  'slideshare.net',
  'academia.edu',
  'researchgate.net'
];

/**
 * Validate URL format
 * @param url - URL to validate
 * @returns Validation result with trust status
 */
export function validateURL(url: string): URLValidation {
  // Check URL format - must start with http:// or https://
  const urlPattern = /^https?:\/\/.+/;
  if (!urlPattern.test(url)) {
    return {
      isValid: false,
      isTrusted: false,
      warning: 'URL không hợp lệ'
    };
  }

  try {
    // Parse URL to check domain
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Check if domain is trusted
    const isTrusted = TRUSTED_DOMAINS.some(trusted => 
      domain.includes(trusted)
    );

    return {
      isValid: true,
      isTrusted,
      warning: undefined // Warning removed per user request
    };
  } catch (error) {
    return {
      isValid: false,
      isTrusted: false,
      warning: 'URL không hợp lệ'
    };
  }
}

/**
 * Sanitize URL to prevent XSS attacks
 * Encodes special characters
 * @param url - URL to sanitize
 * @returns Sanitized URL
 */
export function sanitizeURL(url: string): string {
  return url
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/`/g, '%60');
}

/**
 * Check URL security and provide user-facing result
 * @param url - URL to check
 * @returns Security check result
 */
export function checkURLSecurity(url: string): URLSecurityResult {
  const validation = validateURL(url);

  if (!validation.isValid) {
    return {
      canProceed: false,
      warning: 'URL không hợp lệ'
    };
  }

  // Allow all valid URLs without warnings
  return {
    canProceed: true,
    warning: null
  };
}
