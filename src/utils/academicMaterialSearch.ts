import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { requireRuntimeFeature } from '../config/runtimeConfig';

export interface CollectedAcademicSource {
  title: string;
  url: string;
  provider?: string;
  driveFileId?: string;
  kind?: 'document' | 'folder';
  discoveredFrom?: string;
}

export interface AcademicDiscoveryLink {
  title: string;
  url: string;
}

export interface AcademicMaterialSearchResult {
  query: string;
  sources: CollectedAcademicSource[];
  discoveryLinks: AcademicDiscoveryLink[];
  sourceWarning: string;
  extractedCount: number;
}

export interface AcademicMaterialSearchInput {
  query?: string;
  sourceText?: string;
  sourceUrl?: string;
}

function safeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function searchAcademicMaterials(
  input: AcademicMaterialSearchInput,
): Promise<AcademicMaterialSearchResult> {
  requireRuntimeFeature(
    'librarySearchEnabled',
    'Tìm học liệu đang được bảo trì. Vui lòng thử lại sau.',
  );
  const callable = httpsCallable<AcademicMaterialSearchInput, AcademicMaterialSearchResult>(
    functions,
    'searchAcademicMaterials',
    { timeout: 25_000 },
  );
  const response = await callable({
    query: input.query?.trim() || '',
    sourceText: input.sourceText?.trim() || '',
    sourceUrl: input.sourceUrl?.trim() || '',
  });
  const data = response.data;
  return {
    query: typeof data?.query === 'string' ? data.query : '',
    sources: Array.isArray(data?.sources)
      ? data.sources.filter((source) => source?.title && safeHttpUrl(source?.url))
      : [],
    discoveryLinks: Array.isArray(data?.discoveryLinks)
      ? data.discoveryLinks.filter((source) => source?.title && safeHttpUrl(source?.url))
      : [],
    sourceWarning: typeof data?.sourceWarning === 'string' ? data.sourceWarning : '',
    extractedCount: Number.isFinite(data?.extractedCount) ? data.extractedCount : 0,
  };
}
