import { describe, expect, it } from 'vitest';
import {
  getCallErrorMessage,
  getDatingErrorMessage,
  getStudyRoomErrorMessage,
  getVoiceMatchErrorMessage,
  isPermissionError,
} from './userFacingErrors';

describe('user-facing Firebase and media errors', () => {
  it('không để lộ lỗi quyền Firestore tiếng Anh', () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });

    expect(isPermissionError(error)).toBe(true);
    expect(getDatingErrorMessage(error)).not.toContain('Missing');
    expect(getCallErrorMessage(error, 'video')).not.toContain('permissions');
  });

  it('giải thích đúng khi trình duyệt từ chối camera và micro', () => {
    const error = new DOMException('Permission denied', 'NotAllowedError');
    expect(getCallErrorMessage(error, 'video')).toContain('camera và micro');
  });

  it('phân biệt trạng thái bận với lỗi kết nối', () => {
    const busy = Object.assign(new Error('Người này đang trong cuộc gọi khác.'), {
      code: 'functions/already-exists',
    });
    expect(getCallErrorMessage(busy, 'audio')).toBe('Người này đang trong cuộc gọi khác.');
  });

  it('giữ lỗi phòng học và ghép giọng nói nhất quán bằng tiếng Việt', () => {
    expect(getStudyRoomErrorMessage({ code: 'functions/resource-exhausted' })).toContain('đủ thành viên');
    expect(getVoiceMatchErrorMessage({ code: 'functions/not-found' })).toContain('chưa sẵn sàng');
  });
});
