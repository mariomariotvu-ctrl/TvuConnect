interface ErrorLike {
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

const asErrorLike = (error: unknown): ErrorLike => (
  error && typeof error === 'object' ? error as ErrorLike : {}
);

const normalizedCode = (error: unknown) => {
  const code = asErrorLike(error).code;
  return typeof code === 'string' ? code.toLowerCase() : '';
};

const normalizedName = (error: unknown) => {
  const name = asErrorLike(error).name;
  return typeof name === 'string' ? name.toLowerCase() : '';
};

const normalizedMessage = (error: unknown) => {
  const message = asErrorLike(error).message;
  return typeof message === 'string' ? message.toLowerCase() : '';
};

export function isPermissionError(error: unknown): boolean {
  const code = normalizedCode(error);
  const name = normalizedName(error);
  const message = normalizedMessage(error);
  return code.endsWith('permission-denied')
    || name === 'notallowederror'
    || message.includes('missing or insufficient permissions');
}

export function getDatingErrorMessage(error: unknown): string {
  const code = normalizedCode(error);
  const message = normalizedMessage(error);

  if (code.endsWith('unauthenticated')) {
    return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.';
  }
  if (code.endsWith('failed-precondition')) {
    return 'Hồ sơ này hiện không còn đủ điều kiện tham gia hẹn hò.';
  }
  if (code.endsWith('permission-denied') || message.includes('missing or insufficient permissions')) {
    return 'Hẹn hò đang tạm gián đoạn do cấu hình hệ thống. Lựa chọn của bạn chưa bị thay đổi.';
  }
  if (code.endsWith('unavailable') || message.includes('network') || message.includes('offline')) {
    return 'Mạng đang không ổn định. Lựa chọn của bạn chưa bị thay đổi, hãy thử lại.';
  }
  return 'Chưa thể lưu lựa chọn lúc này. Lựa chọn của bạn chưa bị thay đổi.';
}

export function getCallErrorMessage(error: unknown, kind: 'audio' | 'video'): string {
  const code = normalizedCode(error);
  const name = normalizedName(error);
  const message = normalizedMessage(error);
  const deviceLabel = kind === 'video' ? 'camera và micro' : 'micro';

  if (code.endsWith('already-exists')) {
    return message.includes('bạn đang')
      ? 'Bạn đang có một cuộc gọi khác.'
      : 'Người này đang trong cuộc gọi khác.';
  }
  if (code.endsWith('unauthenticated')) {
    return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để gọi.';
  }
  if (code.endsWith('permission-denied') || message.includes('missing or insufficient permissions')) {
    return 'Cuộc gọi đang tạm gián đoạn do cấu hình hệ thống. Vui lòng thử lại sau.';
  }
  if (name === 'notallowederror' || name === 'securityerror') {
    return `Trình duyệt chưa được phép dùng ${deviceLabel}. Hãy cấp quyền rồi gọi lại.`;
  }
  if (name === 'notfounderror' || name === 'devicesnotfounderror') {
    return `Không tìm thấy ${deviceLabel} trên thiết bị này.`;
  }
  if (name === 'notreadableerror' || name === 'trackstarterror') {
    return `${deviceLabel[0].toUpperCase()}${deviceLabel.slice(1)} đang được ứng dụng khác sử dụng.`;
  }
  if (name === 'overconstrainederror') {
    return `Thiết bị không đáp ứng cấu hình ${deviceLabel} cần thiết.`;
  }
  if (code.endsWith('unavailable') || message.includes('network') || message.includes('offline')) {
    return 'Kết nối mạng bị gián đoạn. Hãy kiểm tra mạng rồi gọi lại.';
  }
  if (code.endsWith('not-found')) {
    return 'Không tìm thấy người nhận hoặc phiên cuộc gọi không còn tồn tại.';
  }
  return 'Không thể bắt đầu cuộc gọi. Vui lòng thử lại sau.';
}

export function getStudyRoomErrorMessage(error: unknown): string {
  const code = normalizedCode(error);
  const name = normalizedName(error);
  const message = normalizedMessage(error);

  if (name === 'notallowederror' || name === 'securityerror') {
    return 'Trình duyệt chưa được phép dùng micro. Hãy cấp quyền rồi vào lại phòng.';
  }
  if (name === 'notfounderror' || name === 'devicesnotfounderror') {
    return 'Không tìm thấy micro trên thiết bị này.';
  }
  if (code.endsWith('resource-exhausted')) {
    return 'Phòng đã đủ thành viên. Hãy chọn phòng khác.';
  }
  if (code.endsWith('not-found')) {
    return 'Phòng học không còn tồn tại.';
  }
  if (code.endsWith('failed-precondition')) {
    return 'Phòng học đã đóng hoặc hồ sơ của bạn chưa hoàn chỉnh.';
  }
  if (code.endsWith('unauthenticated')) {
    return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để vào phòng.';
  }
  if (isPermissionError(error)) {
    return 'Phòng học đang tạm gián đoạn do cấu hình hệ thống.';
  }
  if (code.endsWith('unavailable') || message.includes('network') || message.includes('offline')) {
    return 'Mạng đang không ổn định. Hãy thử vào phòng lại.';
  }
  return 'Không thể vào phòng học lúc này. Vui lòng thử lại sau.';
}

export function getVoiceMatchErrorMessage(error: unknown): string {
  const code = normalizedCode(error);
  const message = normalizedMessage(error);

  if (code.endsWith('unauthenticated')) {
    return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để ghép cuộc gọi.';
  }
  if (code.endsWith('not-found')) {
    return 'Ghép giọng nói chưa sẵn sàng trên hệ thống.';
  }
  if (isPermissionError(error)) {
    return 'Ghép giọng nói đang tạm gián đoạn do cấu hình hệ thống.';
  }
  if (code.endsWith('unavailable') || message.includes('network') || message.includes('offline')) {
    return 'Mạng đang không ổn định. Hãy thử ghép lại.';
  }
  return 'Chưa thể ghép giọng nói. Vui lòng thử lại sau.';
}
