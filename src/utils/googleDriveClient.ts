const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';
const MAX_INLINE_FILE_SIZE = 100 * 1024 * 1024;

const GOOGLE_EXPORT_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing': 'application/pdf',
};

type DriveErrorCode =
  | 'cancelled'
  | 'configuration'
  | 'permission'
  | 'wrong-file'
  | 'not-downloadable'
  | 'too-large'
  | 'network';

export class GoogleDriveError extends Error {
  constructor(
    public readonly code: DriveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleDriveError';
  }
}

export interface GoogleDriveReference {
  fileId: string;
  kind: 'file' | 'document' | 'spreadsheet' | 'presentation';
}

export interface PickedGoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  accessToken: string;
}

export interface GoogleDriveFileContent {
  id: string;
  name: string;
  originalMimeType: string;
  previewMimeType: string;
  blob: Blob;
}

interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  capabilities?: {
    canDownload?: boolean;
  };
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface CachedDriveToken {
  value: string;
  expiresAt: number;
}

let cachedDriveToken: CachedDriveToken | null = null;

function getDriveConfig() {
  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY?.trim() || '';
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
  const configuredAppId = import.meta.env.VITE_GOOGLE_DRIVE_APP_ID?.trim() || '';
  const inferredAppId = clientId.match(/^(\d+)-/)?.[1] || '';

  return {
    apiKey,
    clientId,
    appId: configuredAppId || inferredAppId,
  };
}

export function isGoogleDriveConfigured(): boolean {
  const { apiKey, clientId } = getDriveConfig();
  return Boolean(apiKey && clientId);
}

export function parseGoogleDriveReference(rawUrl: string): GoogleDriveReference | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    if (host === 'drive.google.com') {
      const pathId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
      const queryId = url.searchParams.get('id');
      const fileId = pathId || queryId;
      return fileId ? { fileId, kind: 'file' } : null;
    }

    if (host === 'docs.google.com') {
      const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
      if (!match) return null;

      const kind = match[1] === 'spreadsheets' ? 'spreadsheet' : match[1] as GoogleDriveReference['kind'];
      return { fileId: match[2], kind };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Drive folders cannot be rendered as a single document. Detect them before
 * an iframe reaches Google's generic 403 page and explain what the uploader
 * needs to change instead.
 */
export function isGoogleDriveFolderUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.hostname.toLowerCase() === 'drive.google.com'
      && /^\/drive\/(?:u\/\d+\/)?folders\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

export function buildGoogleDriveShareUrl(file: Pick<PickedGoogleDriveFile, 'id' | 'mimeType'>): string {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    return `https://docs.google.com/document/d/${file.id}/edit`;
  }
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    return `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
  }
  if (file.mimeType === 'application/vnd.google-apps.presentation') {
    return `https://docs.google.com/presentation/d/${file.id}/edit`;
  }
  return `https://drive.google.com/file/d/${file.id}/view`;
}

export function getCachedGoogleDriveToken(): string | null {
  if (!cachedDriveToken || cachedDriveToken.expiresAt <= Date.now() + 30_000) {
    cachedDriveToken = null;
    return null;
  }
  return cachedDriveToken.value;
}

function waitFor(check: () => boolean, message: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new GoogleDriveError('network', message));
        return;
      }
      window.setTimeout(poll, 50);
    };
    poll();
  });
}

function loadExternalScript(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new GoogleDriveError('network', 'Không thể tải dịch vụ Google Drive.'));
    document.head.appendChild(script);
  });
}

async function ensureGoogleIdentityServices(): Promise<void> {
  const globalWindow = window as any;
  if (!globalWindow.google?.accounts?.oauth2) {
    await loadExternalScript('google-identity-services', 'https://accounts.google.com/gsi/client');
  }
  await waitFor(
    () => Boolean((window as any).google?.accounts?.oauth2),
    'Google Identity Services chưa sẵn sàng. Vui lòng thử lại.',
  );
}

async function ensureGooglePicker(): Promise<void> {
  const globalWindow = window as any;
  if (!globalWindow.gapi) {
    await loadExternalScript('google-api-client', 'https://apis.google.com/js/api.js');
  }
  await waitFor(() => Boolean((window as any).gapi?.load), 'Google Picker chưa sẵn sàng. Vui lòng thử lại.');

  if (globalWindow.google?.picker) return;

  await new Promise<void>((resolve, reject) => {
    globalWindow.gapi.load('picker', {
      callback: resolve,
      onerror: () => reject(new GoogleDriveError('network', 'Không thể mở bộ chọn Google Drive.')),
      timeout: 10_000,
      ontimeout: () => reject(new GoogleDriveError('network', 'Google Picker phản hồi quá chậm.')),
    });
  });
}

async function requestGoogleDriveToken(): Promise<string> {
  const cached = getCachedGoogleDriveToken();
  if (cached) return cached;

  const { clientId } = getDriveConfig();
  if (!clientId) {
    throw new GoogleDriveError('configuration', 'Thiếu Google OAuth Client ID.');
  }

  await ensureGoogleIdentityServices();

  return new Promise<string>((resolve, reject) => {
    const google = (window as any).google;
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response: GoogleTokenResponse) => {
        if (!response.access_token) {
          reject(new GoogleDriveError(
            response.error === 'access_denied' ? 'cancelled' : 'permission',
            response.error_description || 'Google chưa cấp quyền đọc file đã chọn.',
          ));
          return;
        }

        cachedDriveToken = {
          value: response.access_token,
          expiresAt: Date.now() + Math.max(60, response.expires_in || 3_600) * 1_000,
        };
        resolve(response.access_token);
      },
      error_callback: () => reject(new GoogleDriveError('cancelled', 'Đã đóng cửa sổ kết nối Google Drive.')),
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export async function pickGoogleDriveFile(): Promise<PickedGoogleDriveFile | null> {
  const { apiKey, appId } = getDriveConfig();
  if (!apiKey) {
    throw new GoogleDriveError('configuration', 'Thiếu Google Drive API key.');
  }

  const accessToken = await requestGoogleDriveToken();
  await ensureGooglePicker();

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);

    let builder = new google.picker.PickerBuilder()
      .setTitle('Chọn tài liệu để dùng trong TVU Connect')
      .setDeveloperKey(apiKey)
      .setOAuthToken(accessToken)
      .addView(docsView)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action !== google.picker.Action.PICKED || !data.docs?.[0]) return;

        const selected = data.docs[0];
        if (!selected.id) {
          reject(new GoogleDriveError('network', 'Google Drive không trả về mã file.'));
          return;
        }
        resolve({
          id: selected.id,
          name: selected.name || 'Tài liệu Google Drive',
          mimeType: selected.mimeType || 'application/octet-stream',
          accessToken,
        });
      });

    if (appId) builder = builder.setAppId(appId);
    builder.build().setVisible(true);
  });
}

async function readDriveError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message || body?.error_description || response.statusText;
  } catch {
    return response.statusText;
  }
}

function makeDriveRequestUrl(path: string, accessToken?: string): string {
  const { apiKey } = getDriveConfig();
  const separator = path.includes('?') ? '&' : '?';
  if (!accessToken && apiKey) return `${path}${separator}key=${encodeURIComponent(apiKey)}`;
  return path;
}

async function driveFetch(path: string, accessToken?: string): Promise<Response> {
  const response = await fetch(makeDriveRequestUrl(path, accessToken), {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (response.ok) return response;

  const message = await readDriveError(response);
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new GoogleDriveError('permission', message || 'File đang giới hạn quyền truy cập.');
  }
  throw new GoogleDriveError('network', message || 'Không thể tải file từ Google Drive.');
}

export async function loadGoogleDriveFile(
  fileId: string,
  accessToken?: string,
): Promise<GoogleDriveFileContent> {
  const { apiKey } = getDriveConfig();
  if (!accessToken && !apiKey) {
    throw new GoogleDriveError('configuration', 'Google Drive API chưa được cấu hình.');
  }

  const encodedId = encodeURIComponent(fileId);
  const metadataResponse = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodedId}?fields=id,name,mimeType,size,capabilities(canDownload)&supportsAllDrives=true`,
    accessToken,
  );
  const metadata = await metadataResponse.json() as DriveFileMetadata;

  if (metadata.size && Number(metadata.size) > MAX_INLINE_FILE_SIZE) {
    throw new GoogleDriveError('too-large', 'File lớn hơn 100 MB nên không thể mở an toàn trong trình duyệt.');
  }

  let previewMimeType = metadata.mimeType;
  let contentPath: string;

  if (metadata.mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) {
    const exportMimeType = GOOGLE_EXPORT_TYPES[metadata.mimeType];
    if (!exportMimeType) {
      throw new GoogleDriveError('not-downloadable', 'Loại tài liệu Google này chưa hỗ trợ xem trực tiếp.');
    }
    previewMimeType = exportMimeType;
    contentPath = `https://www.googleapis.com/drive/v3/files/${encodedId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
  } else {
    if (metadata.capabilities?.canDownload === false) {
      throw new GoogleDriveError('not-downloadable', 'Chủ file đã tắt quyền tải xuống và xem ngoài Google Drive.');
    }
    contentPath = `https://www.googleapis.com/drive/v3/files/${encodedId}?alt=media&supportsAllDrives=true`;
  }

  const contentResponse = await driveFetch(contentPath, accessToken);
  const downloadedBlob = await contentResponse.blob();
  const blob = downloadedBlob.type
    ? downloadedBlob
    : new Blob([downloadedBlob], { type: previewMimeType });

  return {
    id: metadata.id,
    name: metadata.name,
    originalMimeType: metadata.mimeType,
    previewMimeType: blob.type || previewMimeType,
    blob,
  };
}

export function canPreviewMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf'
    || mimeType.startsWith('image/')
    || mimeType.startsWith('text/')
    || mimeType.startsWith('audio/')
    || mimeType.startsWith('video/');
}
