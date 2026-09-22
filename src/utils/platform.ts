export const isIosDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const isAndroidDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
};

export const isMobileDevice = (): boolean => isIosDevice() || isAndroidDevice();

export const isStandaloneApp = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const displayModeStandalone = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayModeStandalone;
};

export const APP_INSTALL_REQUEST_EVENT = 'tvu-connect:request-install';

export const requestAppInstall = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APP_INSTALL_REQUEST_EVENT));
};

export const getImagePermissionHelp = (): string => {
  if (isIosDevice()) {
    return 'Mở Cài đặt trên iPhone/iPad → Quyền riêng tư & Bảo mật → Camera/Ảnh → cho phép Safari, Chrome hoặc TVU Connect. Sau đó quay lại và chọn ảnh có sẵn nếu chưa muốn bật camera.';
  }

  if (isAndroidDevice()) {
    return 'Mở Cài đặt → Ứng dụng → Chrome hoặc TVU Connect → Quyền → cho phép Camera và Ảnh & video. Sau đó quay lại ứng dụng để thử lại.';
  }

  return 'Nhấn biểu tượng ổ khóa bên trái thanh địa chỉ → Cài đặt trang web → cho phép Camera. Bạn vẫn có thể chọn một ảnh có sẵn mà không cần bật camera.';
};
