import { describe, expect, it } from 'vitest';
import { selectRelevantExcerpt } from './driveKnowledge';

describe('Drive knowledge retrieval', () => {
  it('selects passages related to the student question', () => {
    const text = [
      'Chương mở đầu giới thiệu lịch sử môn học và mục tiêu đào tạo.',
      'Định luật Ôm phát biểu rằng cường độ dòng điện qua vật dẫn tỉ lệ thuận với hiệu điện thế và tỉ lệ nghịch với điện trở.',
      'Phần cuối trình bày nội quy phòng thí nghiệm và cách bảo quản thiết bị.',
    ].join('\n\n');

    const excerpt = selectRelevantExcerpt(text, 'Giải thích định luật Ôm và điện trở', 500);
    expect(excerpt).toContain('Định luật Ôm');
    expect(excerpt).toContain('điện trở');
  });

  it('keeps a useful opening excerpt when no term matches', () => {
    const excerpt = selectRelevantExcerpt('Khái niệm nền tảng của môn học được trình bày tại đây.', 'chủ đề khác', 120);
    expect(excerpt).toContain('Khái niệm nền tảng');
  });
});
