import { describe, expect, it } from 'vitest';
import { validateDocumentForm } from './documentValidation';
import type { DocumentFormData } from '../types/documentLink';

const validDocument = (url: string): DocumentFormData => ({
  title: 'Giáo trình kiểm thử',
  url,
  description: '',
  major_id: 'cong-nghe-thong-tin',
  subject: '',
  category: '',
});

describe('validateDocumentForm', () => {
  it('accepts a concrete Google Drive file', () => {
    expect(validateDocumentForm(validDocument('https://drive.google.com/file/d/file-123/view'))).toEqual([]);
  });

  it('rejects a Google Drive folder before it can produce an embedded 403 page', () => {
    expect(validateDocumentForm(validDocument('https://drive.google.com/drive/folders/folder-123')))
      .toContainEqual({
        field: 'url',
        message: 'Hãy chọn một file cụ thể trong Google Drive, không dùng liên kết thư mục',
      });
  });
});
