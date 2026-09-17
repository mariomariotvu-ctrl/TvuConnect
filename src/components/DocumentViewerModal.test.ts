import { describe, expect, it } from 'vitest';
import { getEmbeddedDocumentUrl } from './DocumentViewerModal';

describe('getEmbeddedDocumentUrl', () => {
  it('converts shared Google files to an in-app preview URL', () => {
    expect(getEmbeddedDocumentUrl('https://drive.google.com/file/d/file-id/view?usp=sharing'))
      .toBe('https://drive.google.com/file/d/file-id/preview');
    expect(getEmbeddedDocumentUrl('https://docs.google.com/document/d/doc-id/edit'))
      .toBe('https://docs.google.com/document/d/doc-id/preview');
  });

  it('uses the embedded Office viewer for Office files', () => {
    expect(getEmbeddedDocumentUrl('https://example.edu/report.xlsx'))
      .toBe('https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fexample.edu%2Freport.xlsx');
  });

  it('keeps direct PDF links intact', () => {
    expect(getEmbeddedDocumentUrl('https://example.edu/book.pdf')).toBe('https://example.edu/book.pdf');
  });
});
