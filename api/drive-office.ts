const DRIVE_API_ORIGIN = 'https://www.googleapis.com/drive/v3/files';
const MAX_OFFICE_FILE_SIZE = 50 * 1024 * 1024;

const OFFICE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function jsonError(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function safeFileName(value: unknown): string {
  const fileName = typeof value === 'string' ? value : 'document';
  return fileName.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'document';
}

function asciiFileName(fileName: string): string {
  return fileName.normalize('NFKD').replace(/[^\x20-\x7E]/g, '_');
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonError('Method not allowed', 405);
    }

    const url = new URL(request.url);
    const fileId = url.searchParams.get('fileId') || '';
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(fileId)) {
      return jsonError('Invalid Drive file ID', 400);
    }

    const apiKey = process.env.GOOGLE_DRIVE_API_KEY || process.env.VITE_GOOGLE_DRIVE_API_KEY;
    if (!apiKey) return jsonError('Drive proxy is not configured', 503);

    const metadataUrl = `${DRIVE_API_ORIGIN}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,capabilities(canDownload)&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}`;
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      return jsonError(metadataResponse.status === 404 ? 'File not found' : 'File is not publicly accessible', metadataResponse.status === 404 ? 404 : 403);
    }

    const metadata = await metadataResponse.json() as {
      name?: string;
      mimeType?: string;
      size?: string;
      capabilities?: { canDownload?: boolean };
    };
    const fileName = safeFileName(metadata.name);
    const mimeType = metadata.mimeType || 'application/octet-stream';
    const fileSize = Number(metadata.size || 0);

    if (!OFFICE_MIME_TYPES.has(mimeType) && !/\.(doc|xls|xlsx|ppt|pptx)$/i.test(fileName)) {
      return jsonError('Only Office documents can use this preview endpoint', 415);
    }
    if (metadata.capabilities?.canDownload === false) {
      return jsonError('The owner disabled downloads for this file', 403);
    }
    if (Number.isFinite(fileSize) && fileSize > MAX_OFFICE_FILE_SIZE) {
      return jsonError('Office document is too large to preview', 413);
    }

    const contentUrl = `${DRIVE_API_ORIGIN}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}`;
    const contentResponse = await fetch(contentUrl);
    if (!contentResponse.ok || !contentResponse.body) {
      return jsonError('Unable to read this Office document', contentResponse.status === 404 ? 404 : 502);
    }

    const headers = new Headers({
      'Content-Type': contentResponse.headers.get('content-type') || mimeType,
      'Content-Disposition': `inline; filename="${asciiFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    });
    const contentLength = contentResponse.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(request.method === 'HEAD' ? null : contentResponse.body, {
      status: 200,
      headers,
    });
  },
};
