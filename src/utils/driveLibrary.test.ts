import { describe, expect, it } from 'vitest';
import { driveFileToDocumentLink, inferDriveDocumentCategory, isExternalGoogleDriveDocument } from './driveLibrary';

describe('TVU Drive library mapping', () => {
  it('uses the folder path as the searchable subject and removes file extensions', () => {
    const document = driveFileToDocumentLink({
      id: 'file-1',
      name: 'Giáo trình lập trình.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2026-09-21T00:00:00Z',
      folderPath: ['Công nghệ thông tin', 'Lập trình C'],
    });

    expect(document.title).toBe('Giáo trình lập trình');
    expect(document.subject).toBe('Lập trình C');
    expect(document.category).toBe('Giáo trình');
    expect(document.source).toBe('google_drive');
  });

  it('classifies common study file names', () => {
    expect(inferDriveDocumentCategory({ name: 'Đề thi cuối kỳ.docx', mimeType: 'application/octet-stream' })).toBe('Đề thi');
    expect(inferDriveDocumentCategory({ name: 'Bài giảng tuần 1.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })).toBe('Slide bài giảng');
  });

  it('hides legacy Drive links while preserving the canonical mapped source', () => {
    const base = driveFileToDocumentLink({ id: 'file-2', name: 'Tài liệu.pdf', mimeType: 'application/pdf', folderPath: [] });
    expect(isExternalGoogleDriveDocument(base)).toBe(false);
    expect(isExternalGoogleDriveDocument({ ...base, source: 'firestore', url: 'https://drive.google.com/file/d/old/view' })).toBe(true);
  });
});
