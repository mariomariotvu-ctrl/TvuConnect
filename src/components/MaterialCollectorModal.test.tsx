import { describe, expect, it } from 'vitest';
import { materialSourceToFormDefaults } from './MaterialCollectorModal';

describe('materialSourceToFormDefaults', () => {
  it('turns a collected public PDF into a library contribution', () => {
    expect(materialSourceToFormDefaults({
      title: 'Giáo trình Triết học Mác Lênin.pdf',
      url: 'https://university.edu.vn/files/philosophy.pdf',
      discoveredFrom: 'https://facebook.com/groups/students/posts/1',
    }, 'Triết học Mác Lênin')).toEqual({
      title: 'Giáo trình Triết học Mác Lênin.pdf',
      major_id: 'hoc-lieu-chung',
      subject: 'Triết học Mác Lênin',
      category: 'Giáo trình',
      url: 'https://university.edu.vn/files/philosophy.pdf',
      description: 'Nguồn được gom từ https://facebook.com/groups/students/posts/1',
    });
  });
});
