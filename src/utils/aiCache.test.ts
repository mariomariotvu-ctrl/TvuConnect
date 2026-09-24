import { describe, expect, it } from 'vitest';
import { findCachedResponse, shouldUseCache } from './aiCache';

describe('AI guidance cache', () => {
  it('uses local cache only for stable app guidance', () => {
    expect(shouldUseCache('Cách tìm bạn cùng ngành như thế nào?')).toBe(true);
    expect(findCachedResponse('Cách tìm bạn cùng ngành như thế nào?')).toContain('Vào Tìm bạn');
  });

  it('never treats an academic request containing “danh sách” as a book request', () => {
    const question = 'Trình bày định luật Ôm và danh sách giải thích I, U, R.';

    expect(shouldUseCache(question)).toBe(false);
    expect(findCachedResponse(question)).toBeNull();
  });

  it('does not cache current information requests', () => {
    expect(shouldUseCache('Cách bật thông báo hiện tại?')).toBe(false);
  });
});
