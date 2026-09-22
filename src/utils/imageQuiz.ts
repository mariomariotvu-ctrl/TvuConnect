import type { DocumentLink } from '../types/documentLink';
import { parseGoogleDriveReference } from './googleDriveClient';

const naturalNameCollator = new Intl.Collator('vi', {
  numeric: true,
  sensitivity: 'base',
});

export const IMAGE_QUIZ_ORDER_KEY_PREFIX = 'tvu-connect:image-quiz-order:v1:';

export interface ImageQuizGridItem {
  type: 'image-quiz';
  key: string;
  documents: DocumentLink[];
}

export interface DocumentGridItem {
  type: 'document';
  key: string;
  document: DocumentLink;
}

export type LibraryGridItem = ImageQuizGridItem | DocumentGridItem;

export function isDriveImageDocument(document: DocumentLink): boolean {
  return document.source === 'google_drive' && Boolean(document.mimeType?.startsWith('image/'));
}

export function getImageQuizGroupKey(document: DocumentLink): string {
  const path = document.folderPath?.map((part) => part.trim()).filter(Boolean) || [];
  return path.length > 0 ? path.join('\u001f') : '__drive_root__';
}

export function getImageQuizStorageKey(groupKey: string): string {
  return `${IMAGE_QUIZ_ORDER_KEY_PREFIX}${encodeURIComponent(groupKey)}`;
}

export function sortImageQuizDocuments(documents: DocumentLink[]): DocumentLink[] {
  return [...documents].sort((left, right) => {
    const byTitle = naturalNameCollator.compare(left.title, right.title);
    return byTitle !== 0 ? byTitle : left.id.localeCompare(right.id);
  });
}

export function reconcileImageQuizOrder(
  documents: DocumentLink[],
  savedIds: string[] = [],
): DocumentLink[] {
  const naturallySorted = sortImageQuizDocuments(documents);
  if (savedIds.length === 0) return naturallySorted;

  const byId = new Map(naturallySorted.map((document) => [document.id, document]));
  const savedDocuments = savedIds
    .map((id) => byId.get(id))
    .filter((document): document is DocumentLink => Boolean(document));
  const savedIdSet = new Set(savedDocuments.map((document) => document.id));

  return [
    ...savedDocuments,
    ...naturallySorted.filter((document) => !savedIdSet.has(document.id)),
  ];
}

export function getDriveFileId(document: DocumentLink): string | null {
  const parsed = parseGoogleDriveReference(document.url);
  if (parsed?.fileId) return parsed.fileId;
  return document.id.startsWith('drive-') ? document.id.slice('drive-'.length) : null;
}

export function getDriveImageSources(document: DocumentLink): string[] {
  const fileId = getDriveFileId(document);
  if (!fileId) return [];
  const encodedId = encodeURIComponent(fileId);
  return [
    `https://drive.google.com/thumbnail?id=${encodedId}&sz=w1600`,
    `https://drive.google.com/uc?export=view&id=${encodedId}`,
  ];
}

export function buildLibraryGridItems(documents: DocumentLink[]): LibraryGridItem[] {
  const imageGroups = new Map<string, DocumentLink[]>();

  documents.forEach((document) => {
    if (!isDriveImageDocument(document)) return;
    const groupKey = getImageQuizGroupKey(document);
    const group = imageGroups.get(groupKey) || [];
    group.push(document);
    imageGroups.set(groupKey, group);
  });

  const emittedGroups = new Set<string>();
  const items: LibraryGridItem[] = [];

  documents.forEach((document) => {
    if (!isDriveImageDocument(document)) {
      items.push({ type: 'document', key: document.id, document });
      return;
    }

    const groupKey = getImageQuizGroupKey(document);
    if (emittedGroups.has(groupKey)) return;
    emittedGroups.add(groupKey);
    items.push({
      type: 'image-quiz',
      key: `image-quiz:${groupKey}`,
      documents: imageGroups.get(groupKey) || [document],
    });
  });

  return items;
}
