import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import type { DocumentLink } from '../types/documentLink';
import {
  buildLibraryGridItems,
  getDriveImageSources,
  reconcileImageQuizOrder,
  sortImageQuizDocuments,
} from './imageQuiz';

function createDriveDocument(
  id: string,
  title: string,
  mimeType = 'image/jpeg',
  folderPath = ['KỸ NĂNG MT _ THCB', 'MODULE 2 _ 6 (Video)'],
): DocumentLink {
  return {
    id: `drive-${id}`,
    title,
    major_id: 'Học liệu TVU',
    subject: folderPath.at(-1) || 'Học liệu chung',
    category: 'Tài liệu tham khảo',
    url: `https://drive.google.com/file/d/${id}/view`,
    description: 'Tài liệu Drive',
    createdAt: Timestamp.now(),
    createdBy: 'tvu-drive-library',
    source: 'google_drive',
    mimeType,
    folderPath,
  };
}

describe('Drive image quiz', () => {
  it('naturally sorts numbered image names into question order', () => {
    const documents = [
      createDriveDocument('2075', 'IMG_2075'),
      createDriveDocument('2073', 'IMG_2073'),
      createDriveDocument('2074', 'IMG_2074'),
    ];

    expect(sortImageQuizDocuments(documents).map((document) => document.title)).toEqual([
      'IMG_2073',
      'IMG_2074',
      'IMG_2075',
    ]);
  });

  it('keeps a local manual order and appends newly synced images', () => {
    const documents = [
      createDriveDocument('2075', 'IMG_2075'),
      createDriveDocument('2073', 'IMG_2073'),
      createDriveDocument('2074', 'IMG_2074'),
    ];

    expect(reconcileImageQuizOrder(documents, ['drive-2075', 'drive-2073']).map((document) => document.id)).toEqual([
      'drive-2075',
      'drive-2073',
      'drive-2074',
    ]);
  });

  it('groups Drive images from the same folder without changing normal documents', () => {
    const imageA = createDriveDocument('2073', 'IMG_2073');
    const imageB = createDriveDocument('2075', 'IMG_2075');
    const pdf = createDriveDocument('book', 'Giáo trình', 'application/pdf');
    const otherFolderImage = createDriveDocument('other', 'Câu 1', 'image/png', ['Môn khác']);
    const items = buildLibraryGridItems([imageB, pdf, imageA, otherFolderImage]);

    expect(items).toHaveLength(3);
    expect(items[0].type).toBe('image-quiz');
    expect(items[0].type === 'image-quiz' && items[0].documents).toHaveLength(2);
    expect(items[1].type).toBe('document');
    expect(items[2].type).toBe('image-quiz');
  });

  it('uses a directly visible Drive thumbnail before the fallback source', () => {
    const [thumbnail, fallback] = getDriveImageSources(createDriveDocument('file-id', 'IMG_1'));
    expect(thumbnail).toContain('drive.google.com/thumbnail');
    expect(thumbnail).toContain('file-id');
    expect(fallback).toContain('export=view');
  });
});
