const { onCall, HttpsError } = require('firebase-functions/v2/https');
const dns = require('node:dns/promises');
const net = require('node:net');
const { searchOpenAcademicSources } = require('./askStudentAssistant');
const { getRuntimeConfig } = require('./runtimeConfig');

const MAX_QUERY_LENGTH = 300;
const MAX_SOURCE_TEXT_LENGTH = 30_000;
const MAX_SOURCE_HTML_BYTES = 1_000_000;
const MAX_RESULTS = 20;
const FETCH_TIMEOUT_MS = 8_000;

const DOCUMENT_EXTENSION = /\.(?:pdf|docx?|pptx?|xlsx?|odt|ods|odp|epub)(?:$|[?#])/i;
const MATERIAL_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'www.dropbox.com',
  'onedrive.live.com',
  '1drv.ms',
  'archive.org',
  'openlibrary.org',
]);
const PUBLIC_SOURCE_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'drive.google.com',
  'docs.google.com',
]);

function asText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/gi, '/');
}

function stripTrailingPunctuation(value) {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[),.;!?}\]>'"”’]+$/g, '');
}

function unwrapFacebookRedirect(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if ((url.hostname === 'l.facebook.com' || url.hostname === 'lm.facebook.com') && url.pathname === '/l.php') {
      const target = url.searchParams.get('u');
      return target ? decodeURIComponent(target) : rawUrl;
    }
  } catch {
    return rawUrl;
  }
  return rawUrl;
}

function parseDriveReference(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === 'drive.google.com') {
      const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
      if (fileId) return { fileId, kind: 'file' };
      const folderId = url.pathname.match(/\/drive\/(?:u\/\d+\/)?folders\/([^/]+)/)?.[1];
      if (folderId) return { fileId: folderId, kind: 'folder' };
    }
    if (url.hostname === 'docs.google.com') {
      const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
      if (match) return { fileId: match[2], kind: match[1] };
    }
  } catch {
    return null;
  }
  return null;
}

function canonicalizeMaterialUrl(rawUrl) {
  const unwrapped = unwrapFacebookRedirect(stripTrailingPunctuation(decodeHtml(rawUrl)));
  try {
    const url = new URL(unwrapped);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';

    const drive = parseDriveReference(url.toString());
    if (drive?.kind === 'file') return `https://drive.google.com/file/d/${drive.fileId}/view`;
    if (drive?.kind === 'document') return `https://docs.google.com/document/d/${drive.fileId}/edit`;
    if (drive?.kind === 'spreadsheets') return `https://docs.google.com/spreadsheets/d/${drive.fileId}/edit`;
    if (drive?.kind === 'presentation') return `https://docs.google.com/presentation/d/${drive.fileId}/edit`;
    if (drive?.kind === 'folder') return `https://drive.google.com/drive/folders/${drive.fileId}`;

    return url.toString();
  } catch {
    return null;
  }
}

function isMaterialUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return MATERIAL_HOSTS.has(url.hostname.toLowerCase()) || DOCUMENT_EXTENSION.test(url.pathname);
  } catch {
    return false;
  }
}

function inferSourceTitle(url, index) {
  const drive = parseDriveReference(url);
  if (drive?.kind === 'folder') return `Thư mục Drive công khai ${index + 1}`;
  if (drive) return `Tài liệu Google Drive ${index + 1}`;
  try {
    const parsed = new URL(url);
    const filename = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) || '');
    return filename || `Nguồn học liệu ${index + 1}`;
  } catch {
    return `Nguồn học liệu ${index + 1}`;
  }
}

function extractMaterialLinks(input, sourceUrl = '') {
  const decoded = decodeHtml(asText(input, MAX_SOURCE_TEXT_LENGTH));
  const rawUrls = [];
  const patterns = [
    /https?:\/\/[^\s<>"']+/gi,
    /href\s*=\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern)) rawUrls.push(match[1] || match[0]);
  }

  const directSource = canonicalizeMaterialUrl(sourceUrl);
  if (directSource && isMaterialUrl(directSource)) rawUrls.unshift(directSource);

  const seen = new Set();
  const results = [];
  for (const rawUrl of rawUrls) {
    const url = canonicalizeMaterialUrl(rawUrl);
    if (!url || !isMaterialUrl(url)) continue;
    const drive = parseDriveReference(url);
    const key = drive ? `drive:${drive.kind}:${drive.fileId}` : url;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      title: inferSourceTitle(url, results.length),
      url,
      provider: drive ? 'google-drive' : new URL(url).hostname,
      driveFileId: drive?.kind === 'folder' ? undefined : drive?.fileId,
      kind: drive?.kind === 'folder' ? 'folder' : 'document',
      discoveredFrom: sourceUrl || undefined,
    });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

function buildDiscoveryLinks(query) {
  const clean = asText(query, MAX_QUERY_LENGTH);
  if (!clean) return [];
  const searches = [
    ['Tìm rộng trên web', `"${clean}" (giáo trình OR tài liệu OR sách OR filetype:pdf)`],
    ['Bài đăng và cộng đồng', `"${clean}" (site:facebook.com OR site:groups.google.com)`],
    ['Google Drive và Docs', `"${clean}" (site:drive.google.com OR site:docs.google.com)`],
    ['Trường và thư viện', `"${clean}" (site:edu.vn OR site:gov.vn) (pdf OR giáo trình)`],
  ];
  return searches.map(([title, expression]) => ({
    title,
    url: `https://www.google.com/search?q=${encodeURIComponent(expression)}`,
  }));
}

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || parts[0] === 0;
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return true;
}

function isAllowedPublicSourceHost(hostname) {
  const host = hostname.toLowerCase();
  return PUBLIC_SOURCE_HOSTS.has(host)
    || host.endsWith('.edu.vn')
    || host.endsWith('.gov.vn')
    || host.endsWith('.edu')
    || host.endsWith('.org');
}

async function assertPublicSourceUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !isAllowedPublicSourceHost(url.hostname)) {
    throw new Error('Nguồn này chưa nằm trong danh sách website công khai được phép quét.');
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Địa chỉ nguồn không hợp lệ.');
  }
  return url;
}

async function readLimitedText(response) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_SOURCE_HTML_BYTES) throw new Error('Trang nguồn quá lớn để quét an toàn.');
  if (!response.body?.getReader) return (await response.text()).slice(0, MAX_SOURCE_HTML_BYTES);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SOURCE_HTML_BYTES) {
      await reader.cancel();
      throw new Error('Trang nguồn quá lớn để quét an toàn.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

async function fetchPublicSource(rawUrl, dependencies = {}) {
  let current = await assertPublicSourceUrl(rawUrl);
  const fetchImpl = dependencies.fetchImpl || fetch;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(current, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TVUConnectMaterialCollector/1.0)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.2',
      },
      signal: dependencies.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Nguồn chuyển hướng nhưng không cung cấp địa chỉ mới.');
      current = await assertPublicSourceUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Nguồn công khai phản hồi ${response.status}.`);
    return readLimitedText(response);
  }
  throw new Error('Nguồn chuyển hướng quá nhiều lần.');
}

function deduplicateSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const canonical = canonicalizeMaterialUrl(source?.url || '');
    if (!canonical) return false;
    const drive = parseDriveReference(canonical);
    const key = drive ? `drive:${drive.kind}:${drive.fileId}` : canonical;
    if (seen.has(key)) return false;
    seen.add(key);
    source.url = canonical;
    return true;
  }).slice(0, MAX_RESULTS);
}

exports.searchAcademicMaterials = onCall(
  { timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để tìm và gom tài liệu.');
    }

    const runtime = await getRuntimeConfig();
    if (!runtime.librarySearchEnabled) {
      throw new HttpsError('unavailable', 'Tìm học liệu đang được bảo trì.');
    }

    const query = asText(request.data?.query, MAX_QUERY_LENGTH);
    const sourceText = asText(request.data?.sourceText, MAX_SOURCE_TEXT_LENGTH);
    const sourceUrl = asText(request.data?.sourceUrl, 2_000);
    if (!query && !sourceText && !sourceUrl) {
      throw new HttpsError('invalid-argument', 'Hãy nhập tên tài liệu, link nguồn hoặc nội dung bài viết.');
    }

    let fetchedText = '';
    let sourceWarning = '';
    if (sourceUrl) {
      try {
        fetchedText = await fetchPublicSource(sourceUrl);
      } catch (error) {
        sourceWarning = error?.message || 'Không thể đọc trang nguồn. Hãy dán nội dung bài hoặc bình luận để quét link.';
      }
    }

    const extracted = extractMaterialLinks(`${sourceText}\n${fetchedText}`, sourceUrl);
    const openSources = query
      ? await searchOpenAcademicSources(query).catch(() => [])
      : [];
    const sources = deduplicateSources([...extracted, ...openSources]);

    return {
      query,
      sources,
      discoveryLinks: buildDiscoveryLinks(query),
      sourceWarning,
      extractedCount: extracted.length,
    };
  },
);

exports.asText = asText;
exports.buildDiscoveryLinks = buildDiscoveryLinks;
exports.canonicalizeMaterialUrl = canonicalizeMaterialUrl;
exports.extractMaterialLinks = extractMaterialLinks;
exports.fetchPublicSource = fetchPublicSource;
exports.isMaterialUrl = isMaterialUrl;
exports.parseDriveReference = parseDriveReference;
