const MAX_OFFICE_FILE_SIZE = 50 * 1024 * 1024;

const OFFICE_MIME_TYPES: Record<string, string> = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

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

function fileNameFromDisposition(value: string | null): string {
  if (!value) return '';
  const encodedName = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedName) {
    try {
      return safeFileName(decodeURIComponent(encodedName));
    } catch {
      return '';
    }
  }
  return safeFileName(value.match(/filename="?([^";]+)"?/i)?.[1] || '');
}

function officeMimeType(fileName: string, upstreamMimeType: string | null): string | null {
  const knownMimeType = Object.values(OFFICE_MIME_TYPES).find((mimeType) => mimeType === upstreamMimeType);
  if (knownMimeType) return knownMimeType;
  const extension = fileName.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  return extension ? OFFICE_MIME_TYPES[extension] || null : null;
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

    const contentUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    const contentResponse = await fetch(contentUrl, { method: request.method, redirect: 'follow' });
    if (!contentResponse.ok || (request.method === 'GET' && !contentResponse.body)) {
      return jsonError('File is not publicly accessible', contentResponse.status === 404 ? 404 : 403);
    }

    const fileName = fileNameFromDisposition(contentResponse.headers.get('content-disposition'));
    const mimeType = officeMimeType(fileName, contentResponse.headers.get('content-type'));
    if (!fileName || !mimeType) {
      await contentResponse.body?.cancel();
      return jsonError('Only public Office documents can use this preview endpoint', 415);
    }

    const fileSize = Number(contentResponse.headers.get('content-length') || 0);
    if (Number.isFinite(fileSize) && fileSize > MAX_OFFICE_FILE_SIZE) {
      await contentResponse.body?.cancel();
      return jsonError('Office document is too large to preview', 413);
    }

    const headers = new Headers({
      'Content-Type': mimeType,
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
