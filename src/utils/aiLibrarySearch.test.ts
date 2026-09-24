import { describe, expect, it } from 'vitest';
import {
  extractRecognizedLibraryQueries,
  hasSpecificLibrarySearchTerms,
  isLibrarySearchQuery,
  rankPublicDriveFiles,
} from './aiLibrarySearch';

const files = [
  {
    id: 'c-programming',
    name: 'Giáo trình lập trình C.pdf',
    mimeType: 'application/pdf',
    folderPath: ['Công nghệ thông tin', 'Lập trình C'],
  },
  {
    id: 'accounting',
    name: 'Bài tập kế toán quản trị.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    folderPath: ['Kinh tế', 'Kế toán'],
  },
  {
    id: 'medicine',
    name: 'Sinh lý học.pdf',
    mimeType: 'application/pdf',
    folderPath: ['Y đa khoa', 'Sinh lý'],
  },
  {
    id: 'student-support',
    name: 'A_UniS - Hỗ trợ học tập.pdf',
    mimeType: 'application/pdf',
    folderPath: ['Tài liệu tham khảo'],
    description: 'Hỗ trợ sinh viên học tập và quản lý thời gian',
  },
];

describe('AI public Drive library search', () => {
  it('detects explicit requests for academic materials', () => {
    expect(isLibrarySearchQuery('Tìm giáo trình môn lập trình C')).toBe(true);
    expect(isLibrarySearchQuery('Có sách ngành CNTT không?')).toBe(true);
    expect(isLibrarySearchQuery('Giải thích con trỏ trong C')).toBe(false);
    expect(hasSpecificLibrarySearchTerms('Tìm sách và giáo trình theo ngành')).toBe(false);
    expect(hasSpecificLibrarySearchTerms('Tìm sách môn kế toán quản trị')).toBe(true);
  });

  it('ranks title, subject and major folder matches without Vietnamese accents', () => {
    expect(rankPublicDriveFiles('tìm giáo trình cntt lập trình C', files)[0].id).toBe('c-programming');
    expect(rankPublicDriveFiles('tai lieu ke toan', files)[0].id).toBe('accounting');
    expect(rankPublicDriveFiles('sach sinh ly y khoa', files)[0].id).toBe('medicine');
    expect(rankPublicDriveFiles('tìm giáo trình sinh lý', files).some((file) => file.id === 'student-support')).toBe(false);
    expect(rankPublicDriveFiles('sach sinh ly y khoa', files)[0].url)
      .toBe('https://drive.google.com/file/d/medicine/view');
  });

  it('does not confuse short Vietnamese words with prefixes of unrelated words', () => {
    const mixedFiles = [
      ...files,
      {
        id: 'unrelated',
        name: 'Trọng tâm ôn tập.pdf',
        mimeType: 'application/pdf',
        folderPath: ['Logic học'],
      },
    ];

    expect(rankPublicDriveFiles('Tìm tài liệu A_UniS Hỗ trợ học tập', mixedFiles).map((file) => file.id))
      .toEqual(['student-support']);
  });

  it('extracts exact book titles recognized from an uploaded image', () => {
    const answer = [
      'Hình ảnh hiển thị hai giáo trình:',
      '1. **Vi Khuẩn Y Học** – Đại học Y Dược TP.HCM.',
      '2. **Virus Y Học** – Chủ biên Cao Minh Nga.',
      'Bạn có thể dùng **Thư viện Drive ngay trong TVU Connect**.',
    ].join('\n');

    expect(extractRecognizedLibraryQueries('Đọc ảnh và tìm tài liệu phù hợp', answer)).toEqual([
      'Vi Khuẩn Y Học',
      'Virus Y Học',
      'Đọc ảnh và tìm tài liệu phù hợp',
    ]);
    expect(extractRecognizedLibraryQueries(
      'Đọc chữ trong ảnh, xác định môn học và tìm tài liệu công khai phù hợp để mình đọc tiếp.',
      'Phần nhận diện ảnh đang tạm hết lượt.',
    )).toEqual([]);
  });
});
