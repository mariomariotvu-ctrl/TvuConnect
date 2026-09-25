import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { loadGoogleDriveFile } from './googleDriveClient';
import {
  normalizeLibraryText,
  searchPublicDriveLibrary,
  type AILibraryResult,
} from './aiLibrarySearch';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_DOCUMENTS = 2;
const MAX_PDF_PAGES = 40;
const MAX_EXTRACTED_CHARACTERS = 80_000;
const MAX_CONTEXT_PER_DOCUMENT = 8_000;
const MAX_CONTEXT_TOTAL = 14_000;
const DOCUMENT_TEXT_CACHE_MS = 10 * 60 * 1_000;
const DOCUMENT_TEXT_CACHE_LIMIT = 12;
const documentTextCache = new Map<string, { text: string; expiresAt: number }>();

export interface DriveKnowledgeContext {
  id: string;
  title: string;
  url: string;
  mimeType: string;
  folderPath: string[];
  excerpt: string;
}

export interface DriveKnowledgeResult {
  sources: AILibraryResult[];
  context: DriveKnowledgeContext[];
}

const queryTokens = (query: string): string[] => [...new Set(
  normalizeLibraryText(query)
    .split(/\s+/)
    .filter((token) => token.length > 1),
)];

const cleanExtractedText = (value: string): string => value
  .replace(/\u0000/g, ' ')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export function selectRelevantExcerpt(
  text: string,
  query: string,
  maxCharacters = MAX_CONTEXT_PER_DOCUMENT,
): string {
  const cleaned = cleanExtractedText(text).slice(0, MAX_EXTRACTED_CHARACTERS);
  if (!cleaned) return '';

  const tokens = queryTokens(query);
  const chunks = cleaned
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-ZÀ-ỸĐ0-9])/u)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 40)
    .flatMap((chunk) => {
      if (chunk.length <= 1_400) return [chunk];
      const pieces: string[] = [];
      for (let index = 0; index < chunk.length; index += 1_200) {
        pieces.push(chunk.slice(index, index + 1_400));
      }
      return pieces;
    });

  if (!chunks.length) return cleaned.slice(0, maxCharacters);
  const ranked = chunks.map((chunk, index) => {
    const normalized = normalizeLibraryText(chunk);
    const score = tokens.reduce((total, token) => {
      const matches = normalized.split(token).length - 1;
      return total + Math.min(matches, 5);
    }, 0);
    return { chunk, index, score };
  }).sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = ranked
    .filter((item, index) => item.score > 0 || index < 2)
    .slice(0, 8)
    .sort((left, right) => left.index - right.index);

  let excerpt = '';
  for (const item of selected) {
    const candidate = excerpt ? `${excerpt}\n\n${item.chunk}` : item.chunk;
    if (candidate.length > maxCharacters) break;
    excerpt = candidate;
  }
  return (excerpt || cleaned).slice(0, maxCharacters);
}

async function extractPdfText(blob: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  const pages: string[] = [];

  try {
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      pages.push(pageText);
      if (pages.join('\n\n').length >= MAX_EXTRACTED_CHARACTERS) break;
    }
  } finally {
    await task.destroy();
  }
  return pages.join('\n\n');
}

async function extractDocxText(blob: Blob): Promise<string> {
  const { renderAsync } = await import('docx-preview');
  const container = document.createElement('div');
  await renderAsync(blob, container, container, {
    breakPages: false,
    ignoreHeight: true,
    ignoreLastRenderedPageBreak: true,
    ignoreWidth: true,
    renderEndnotes: true,
    renderFootnotes: true,
    renderHeaders: true,
    renderFooters: true,
    useBase64URL: false,
  });
  return container.textContent || '';
}

const decodeXmlText = (xml: string): string => xml
  .replace(/<\/(?:w:p|a:p|row)>/gi, '\n')
  .replace(/<(?:w:tab|a:br)\b[^>]*\/?\s*>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'");

async function extractZippedOfficeText(blob: Blob, kind: 'presentation' | 'spreadsheet'): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const pathPattern = kind === 'presentation'
    ? /^ppt\/slides\/slide\d+\.xml$/i
    : /^xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/i;
  const paths = Object.keys(zip.files)
    .filter((path) => pathPattern.test(path))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const parts: string[] = [];
  for (const path of paths) {
    const file = zip.file(path);
    if (!file) continue;
    parts.push(decodeXmlText(await file.async('string')));
    if (parts.join('\n').length >= MAX_EXTRACTED_CHARACTERS) break;
  }
  return parts.join('\n\n');
}

async function extractDocumentText(source: AILibraryResult): Promise<string> {
  if (source.size && source.size > MAX_SOURCE_BYTES) return '';
  const cached = documentTextCache.get(source.id);
  if (cached && cached.expiresAt > Date.now()) return cached.text;

  const file = await loadGoogleDriveFile(source.id);
  const mimeType = file.previewMimeType.toLowerCase();
  let text = '';
  if (mimeType === 'application/pdf') text = await extractPdfText(file.blob);
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
    text = await file.blob.text();
  }
  if (mimeType.includes('wordprocessingml') || /\.docx$/i.test(file.name)) {
    text = await extractDocxText(file.blob);
  }
  if (mimeType.includes('presentationml') || /\.pptx$/i.test(file.name)) {
    text = await extractZippedOfficeText(file.blob, 'presentation');
  }
  if (mimeType.includes('spreadsheetml') || /\.xlsx$/i.test(file.name)) {
    text = await extractZippedOfficeText(file.blob, 'spreadsheet');
  }
  if (text) {
    if (documentTextCache.size >= DOCUMENT_TEXT_CACHE_LIMIT) {
      const oldestKey = documentTextCache.keys().next().value;
      if (oldestKey) documentTextCache.delete(oldestKey);
    }
    documentTextCache.set(source.id, {
      text: text.slice(0, MAX_EXTRACTED_CHARACTERS),
      expiresAt: Date.now() + DOCUMENT_TEXT_CACHE_MS,
    });
  }
  return text;
}

/**
 * Drive-first retrieval for TVU BuBu. The browser reads only the most relevant
 * public documents, selects short passages, and sends those passages to the
 * server. Full files never become part of chat history.
 */
export async function retrieveDriveKnowledge(query: string): Promise<DriveKnowledgeResult> {
  const sources = await searchPublicDriveLibrary(query).catch(() => []);
  const candidates = sources
    .filter((source) => !source.size || source.size <= MAX_SOURCE_BYTES)
    .slice(0, MAX_DOCUMENTS);
  let remaining = MAX_CONTEXT_TOTAL;

  const settled = await Promise.allSettled(candidates.map(async (source) => {
    const text = await extractDocumentText(source);
    const excerpt = selectRelevantExcerpt(text, query, Math.min(MAX_CONTEXT_PER_DOCUMENT, remaining));
    if (excerpt) remaining = Math.max(0, remaining - excerpt.length);
    return excerpt ? {
      id: source.id,
      title: source.title,
      url: source.url,
      mimeType: source.mimeType,
      folderPath: source.folderPath,
      excerpt,
    } : null;
  }));

  const context = settled.flatMap((result) => (
    result.status === 'fulfilled' && result.value ? [result.value] : []
  ));
  return { sources, context };
}
