import { logger } from './logger';
/**
 * Google Drive File Uploader
 * Tự động upload file lên Google Drive của user và lấy link chia sẻ
 */

// Google Drive API configuration
const GOOGLE_DRIVE_API_KEY = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Shared folder ID — all uploaded documents go here (owned by admin)
const GOOGLE_DRIVE_FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID;
// Use 'drive' scope to allow uploading into a shared folder owned by another account.
// 'drive.file' is insufficient for writing into folders you don't own.
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

// File size limit: 300MB
const MAX_FILE_SIZE = 300 * 1024 * 1024;

// Allowed file types for academic documents
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  'application/msword', // DOC
  'application/vnd.ms-powerpoint', // PPT
  'application/vnd.ms-excel', // XLS
];

export interface UploadResult {
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Declare gapi type
declare const gapi: any;

let isGapiLoaded = false;
let isGapiInitialized = false;

/**
 * Load Google API script
 */
const loadGapiScript = (): Promise<void> => {
  if (isGapiLoaded) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      isGapiLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Không thể tải Google API'));
    document.body.appendChild(script);
  });
};

/**
 * Initialize Google Drive API
 */
export const initGoogleDrive = async (): Promise<void> => {
  try {
    // Check if credentials are configured
    if (!GOOGLE_DRIVE_API_KEY || !GOOGLE_CLIENT_ID) {
      throw new Error('Google Drive API chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
    }

    if (!GOOGLE_DRIVE_FOLDER_ID) {
      console.warn('⚠️ VITE_GOOGLE_DRIVE_FOLDER_ID chưa được cấu hình — file sẽ upload vào root Drive của người dùng.');
    }

    // CRITICAL FIX: Load Google API script first
    await loadGapiScript();

    // Wait for gapi to be available after script loads
    if (typeof gapi === 'undefined') {
      await new Promise<void>((resolve, reject) => {
        const checkGapi = setInterval(() => {
          if (typeof gapi !== 'undefined') {
            clearInterval(checkGapi);
            resolve();
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkGapi);
          reject(new Error('Timeout: Google API script không load được sau 10 giây'));
        }, 10000);
      });
    }

    // Initialize gapi client
    if (!isGapiInitialized) {
      await new Promise<void>((resolve, reject) => {
        gapi.load('client:auth2', async () => {
          try {
            logger.log('🔧 Initializing with:', {
              apiKey: GOOGLE_DRIVE_API_KEY?.substring(0, 10) + '...',
              clientId: GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
              origin: window.location.origin,
            });
            
            // CRITICAL FIX: Better error handling and logging
            try {
              await gapi.client.init({
                apiKey: GOOGLE_DRIVE_API_KEY,
                clientId: GOOGLE_CLIENT_ID,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                scope: GOOGLE_DRIVE_SCOPE,
              });
              isGapiInitialized = true;
              logger.log('✅ Google Drive API initialized successfully');
              resolve();
            } catch (initError: any) {
              // Log full error object with all properties
              console.error('❌ gapi.client.init() failed:', initError);
              console.error('❌ Error type:', typeof initError);
              console.error('❌ Error constructor:', initError?.constructor?.name);
              
              // Try to extract nested error
              if (initError?.error) {
                console.error('❌ Nested error:', initError.error);
              }
              
              // Try to stringify the entire error
              try {
                console.error('❌ Full error JSON:', JSON.stringify(initError, null, 2));
              } catch (e) {
                console.error('❌ Cannot stringify error');
              }
              
              // Log all enumerable properties
              console.error('❌ Error properties:', Object.keys(initError || {}));
              for (const key in initError) {
                console.error(`❌ Error.${key}:`, initError[key]);
              }
              
              // Provide user-friendly error message
              let userMessage = 'Không thể khởi tạo Google Drive API. ';
              
              if (initError?.error?.message) {
                userMessage += initError.error.message;
              } else if (initError?.message) {
                userMessage += initError.message;
              } else if (initError?.result?.error?.message) {
                userMessage += initError.result.error.message;
              } else {
                userMessage += 'Vui lòng kiểm tra:\n';
                userMessage += '1. OAuth Client ID đã thêm origin: ' + window.location.origin + '\n';
                userMessage += '2. API Key đã enable Google Drive API\n';
                userMessage += '3. Authorized JavaScript origins trong Google Cloud Console';
              }
              
              reject(new Error(userMessage));
            }
          } catch (error: any) {
            console.error('❌ Outer error:', error);
            reject(error);
          }
        });
      });
    }
  } catch (error) {
    console.error('Google Drive initialization error:', error);
    throw new Error('Không thể khởi tạo Google Drive API');
  }
};

/**
 * Authenticate user with Google
 */
export const authenticateGoogleDrive = async (): Promise<boolean> => {
  try {
    const authInstance = gapi.auth2.getAuthInstance();
    
    if (!authInstance) {
      throw new Error('Google Auth chưa được khởi tạo');
    }

    // Check if already signed in
    if (!authInstance.isSignedIn.get()) {
      // Sign in with popup
      await authInstance.signIn({
        prompt: 'select_account',
      });
    }

    return authInstance.isSignedIn.get();
  } catch (error) {
    console.error('Authentication error:', error);
    return false;
  }
};

/**
 * Validate file before upload
 */
export const validateFile = (file: File): ValidationResult => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File quá lớn! Tối đa 300MB. File của bạn: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
    };
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Chỉ hỗ trợ file PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX',
    };
  }

  return { valid: true };
};

/**
 * Upload file to Google Drive and get shareable link
 */
export const uploadFileToGoogleDrive = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadResult> => {
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Initialize Google Drive API
    await initGoogleDrive();

    // Authenticate user
    const authenticated = await authenticateGoogleDrive();
    if (!authenticated) {
      return {
        success: false,
        error: 'Bạn cần cấp quyền truy cập Google Drive để upload file',
      };
    }

    // Create file metadata — place file inside the shared TVU Connect folder
    const metadata: Record<string, unknown> = {
      name: file.name,
      mimeType: file.type,
    };

    // If a shared folder ID is configured, upload directly into that folder
    if (GOOGLE_DRIVE_FOLDER_ID) {
      metadata.parents = [GOOGLE_DRIVE_FOLDER_ID];
    }

    // Create form data for multipart upload
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    // Get access token
    const accessToken = gapi.auth.getToken().access_token;

    // Upload file using XMLHttpRequest for progress tracking
    const uploadResult = await new Promise<UploadResult>((resolve) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = Math.round((e.loaded / e.total) * 100);
          onProgress(progress);
        }
      });

      // Handle upload completion
      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            const fileId = response.id;

            // Make file publicly accessible
            await gapi.client.drive.permissions.create({
              fileId: fileId,
              resource: {
                role: 'reader',
                type: 'anyone',
              },
            });

            // Get shareable link
            const shareableLink = `https://drive.google.com/file/d/${fileId}/view`;

            resolve({
              success: true,
              fileUrl: shareableLink,
              fileName: file.name,
              fileSize: file.size,
            });
          } catch (error) {
            console.error('Error creating shareable link:', error);
            resolve({
              success: false,
              error: 'Upload thành công nhưng không thể tạo link chia sẻ',
            });
          }
        } else {
          resolve({
            success: false,
            error: `Upload thất bại: ${xhr.statusText}`,
          });
        }
      });

      // Handle upload error
      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Lỗi kết nối khi upload file',
        });
      });

      // Send request
      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.send(form);
    });

    return uploadResult;
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi upload file',
    };
  }
};

/**
 * Check if user is signed in to Google
 */
export const isSignedIn = (): boolean => {
  try {
    if (!isGapiInitialized) {
      return false;
    }
    const authInstance = gapi.auth2.getAuthInstance();
    return authInstance ? authInstance.isSignedIn.get() : false;
  } catch (error) {
    return false;
  }
};

/**
 * Sign out from Google
 */
export const signOutGoogleDrive = async (): Promise<void> => {
  try {
    if (isGapiInitialized) {
      const authInstance = gapi.auth2.getAuthInstance();
      if (authInstance && authInstance.isSignedIn.get()) {
        await authInstance.signOut();
      }
    }
  } catch (error) {
    console.error('Sign out error:', error);
  }
};
