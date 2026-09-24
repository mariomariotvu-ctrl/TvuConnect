import { inferDriveDocumentCategory } from './driveLibrary';
import {
  buildGoogleDriveShareUrl,
  listGoogleDriveLibraryFiles,
  type GoogleDriveLibraryFile,
} from './googleDriveClient';

export interface AILibraryResult {
  id: string;
  title: string;
  category: string;
  subject: string;
  folderPath: string[];
  mimeType: string;
  url: string;
}

const LIBRARY_INTENT = /\b(tim|kiem|tra|goi y|can|muon|co)\b.*\b(sach|ebook|tai lieu|giao trinh|slide|bai giang|de thi|bai tap|hoc lieu)\b|\b(sach|ebook|tai lieu|giao trinh|hoc lieu)\b.*\b(mon|nganh|khoa|drive|thu vien)\b/i;
const GENERIC_SEARCH_WORDS = new Set([
  'tim', 'kiem', 'tra', 'goi', 'y', 'can', 'muon', 'co', 'cho', 'minh', 'toi', 've', 'trong',
  'sach', 'ebook', 'tai', 'lieu', 'giao', 'trinh', 'slide', 'bai', 'giang', 'de', 'thi',
  'hoc', 'mon', 'nganh', 'khoa', 'drive', 'thu', 'vien', 'tvu', 'connect', 'va', 'theo', 'mot', 'so',
]);

const QUERY_ALIASES: Record<string, string[]> = {
  cntt: ['cong', 'nghe', 'thong', 'tin', 'lap', 'trinh'],
  it: ['cong', 'nghe', 'thong', 'tin'],
  ai: ['tri', 'tue', 'nhan', 'tao', 'artificial', 'intelligence'],
  qtkd: ['quan', 'tri', 'kinh', 'doanh'],
  marketing: ['tiep', 'thi'],
  y: ['y', 'khoa', 'y', 'da', 'khoa'],
  duoc: ['duoc', 'hoc', 'pharmacy'],
  nursing: ['dieu', 'duong'],
};

export const normalizeLibraryText = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const cleanFileTitle = (name: string) => name.replace(/\.[a-z0-9]{1,8}$/i, '').trim() || name;

const cleanRecognizedTitle = (value: string): string => value
  .replace(/^\s*(?:\d+[.)]|[-•])\s*/, '')
  .replace(/^\*\*|\*\*$/g, '')
  .split(/\s+[–—]\s+|\s*:\s+/)[0]
  .replace(/[.。]+$/, '')
  .trim();

const meaningfulTokens = (query: string): string[] => {
  const rawTokens = normalizeLibraryText(query).split(/\s+/).filter(Boolean);
  const expanded = rawTokens.flatMap((token) => [token, ...(QUERY_ALIASES[token] || [])]);
  const useful = expanded.filter((token) => token.length > 1 && !GENERIC_SEARCH_WORDS.has(token));
  return [...new Set(useful)];
};

export function hasSpecificLibrarySearchTerms(query: string): boolean {
  return meaningfulTokens(query).length > 0;
}

export function isLibrarySearchQuery(query: string): boolean {
  return LIBRARY_INTENT.test(normalizeLibraryText(query));
}

/**
 * Pull book titles out of an image-reading answer before searching Drive.
 * Vision responses commonly return titles as bold text, quotes or a numbered
 * list; keeping these short queries avoids diluting the match with the whole
 * explanatory answer.
 */
export function extractRecognizedLibraryQueries(userMessage: string, answer: string): string[] {
  const candidates: string[] = [];
  const collect = (pattern: RegExp) => {
    for (const match of answer.matchAll(pattern)) {
      const title = cleanRecognizedTitle(match[1] || '');
      if (title) candidates.push(title);
    }
  };

  collect(/\*\*([^*\n]{3,140})\*\*/g);
  collect(/["“”]([^"“”\n]{3,140})["“”]/g);
  collect(/^\s*\d+[.)]\s+(?:\*\*)?([^\n*]{3,140})(?:\*\*)?/gm);

  const genericImagePrompt = /doc chu trong anh|xac dinh mon hoc|trang sach nay/i.test(normalizeLibraryText(userMessage));
  if (!genericImagePrompt && isLibrarySearchQuery(userMessage) && hasSpecificLibrarySearchTerms(userMessage)) {
    candidates.push(userMessage);
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = normalizeLibraryText(candidate);
    if (!normalized || seen.has(normalized) || normalized.includes('thu vien drive') || normalized.includes('tvu connect')) {
      return false;
    }
    if (!hasSpecificLibrarySearchTerms(candidate)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 5);
}

export function rankPublicDriveFiles(
  query: string,
  files: GoogleDriveLibraryFile[],
  limit = 6,
): AILibraryResult[] {
  const normalizedQuery = normalizeLibraryText(query);
  const tokens = meaningfulTokens(query);
  if (!tokens.length) return [];

  return files
    .map((file) => {
      const title = cleanFileTitle(file.name);
      const normalizedTitle = normalizeLibraryText(title);
      const normalizedFolders = normalizeLibraryText(file.folderPath.join(' '));
      const normalizedDescription = normalizeLibraryText(file.description || '');
      const titleWords = new Set(normalizedTitle.split(/\s+/).filter(Boolean));
      const folderWords = new Set(normalizedFolders.split(/\s+/).filter(Boolean));
      const descriptionWords = new Set(normalizedDescription.split(/\s+/).filter(Boolean));
      let score = 0;
      const matchedTokens = new Set<string>();
      const structuredMatches = new Set<string>();

      if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) score += 160;
      for (const token of tokens) {
        if (normalizedTitle === token) {
          score += 80;
          matchedTokens.add(token);
          structuredMatches.add(token);
        } else if (titleWords.has(token)) {
          score += 32;
          matchedTokens.add(token);
          structuredMatches.add(token);
        }
        if (folderWords.has(token)) {
          score += 20;
          matchedTokens.add(token);
          structuredMatches.add(token);
        }
        if (descriptionWords.has(token)) {
          score += 8;
          matchedTokens.add(token);
        }
      }
      if (/pdf|document|word|presentation|powerpoint/.test(file.mimeType)) score += 2;

      // A multi-word subject such as "sinh ly" must match most of the subject,
      // not just a generic word like "sinh" hidden in a description.
      const minimumMatches = tokens.length > 1 ? Math.ceil(tokens.length * 0.6) : 1;
      if (matchedTokens.size < minimumMatches || (tokens.length > 1 && structuredMatches.size < minimumMatches)) {
        score = 0;
      }

      return { file, title, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || (right.file.modifiedTime || '').localeCompare(left.file.modifiedTime || '')
      || left.title.localeCompare(right.title, 'vi'))
    .slice(0, limit)
    .map(({ file, title }) => ({
      id: file.id,
      title,
      category: inferDriveDocumentCategory(file),
      subject: file.folderPath.at(-1) || 'Học liệu chung',
      folderPath: [...file.folderPath],
      mimeType: file.mimeType,
      url: buildGoogleDriveShareUrl(file),
    }));
}

export async function searchPublicDriveLibrary(
  query: string,
  onProgress?: (results: AILibraryResult[]) => void,
): Promise<AILibraryResult[]> {
  if (!hasSpecificLibrarySearchTerms(query)) return [];

  let latestResults: AILibraryResult[] = [];
  let resolveFirstMatch: ((results: AILibraryResult[]) => void) | undefined;
  const firstMatch = new Promise<AILibraryResult[]>((resolve) => {
    resolveFirstMatch = resolve;
  });
  const completedSearch = listGoogleDriveLibraryFiles(false, (snapshot) => {
    if (!snapshot.files.length) return;
    latestResults = rankPublicDriveFiles(query, snapshot.files);
    onProgress?.(latestResults);
    if (latestResults.length) resolveFirstMatch?.(latestResults);
  }).then((files) => rankPublicDriveFiles(query, files));

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const firstUsefulResponse = await Promise.race([
    completedSearch,
    firstMatch,
    new Promise<AILibraryResult[]>((resolve) => {
      timeoutId = setTimeout(() => resolve(latestResults), 5_000);
    }),
  ]);
  if (timeoutId) clearTimeout(timeoutId);
  return firstUsefulResponse;
}

export async function searchRecognizedDriveLibrary(
  userMessage: string,
  answer: string,
  onProgress?: (results: AILibraryResult[]) => void,
): Promise<AILibraryResult[]> {
  const queries = extractRecognizedLibraryQueries(userMessage, answer);
  if (!queries.length) return [];

  const matches = new Map<string, AILibraryResult>();
  const merge = (results: AILibraryResult[]) => {
    for (const result of results) matches.set(result.id, result);
    const merged = [...matches.values()].slice(0, 8);
    if (merged.length) onProgress?.(merged);
    return merged;
  };

  const settled = await Promise.allSettled(
    queries.map((query) => searchPublicDriveLibrary(query, merge)),
  );
  for (const result of settled) {
    if (result.status === 'fulfilled') merge(result.value);
  }
  return [...matches.values()].slice(0, 8);
}
