import React, { useEffect, useState } from 'react';
import { Joyride, STATUS, EVENTS, type Step, type EventData, type Controls } from 'react-joyride';
import { useTheme } from '../contexts/ThemeContext';
import { logger } from '@/utils/logger';
import '../styles/tour.css';

interface OnboardingTourProps {
  run?: boolean;
  onComplete?: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ run = false, onComplete }) => {
  const [runTour, setRunTour] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const { theme } = useTheme();
  const [isCompactNavigation, setIsCompactNavigation] = useState(() => (
    window.matchMedia('(max-width: 1279px)').matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1279px)');
    const updateNavigationMode = (event: MediaQueryListEvent) => setIsCompactNavigation(event.matches);
    mediaQuery.addEventListener('change', updateNavigationMode);
    return () => mediaQuery.removeEventListener('change', updateNavigationMode);
  }, []);

  useEffect(() => {
    if (!run) {
      setRunTour(false);
      setStepIndex(0);
      return;
    }

    logger.log('Tour trigger | Compact navigation:', isCompactNavigation);

    // Poll until nav elements are in the DOM
    let attempts = 0;
    const maxAttempts = 30;
    const intervalId = setInterval(() => {
      const expectedTargets = isCompactNavigation
        ? ['mobile-home', 'mobile-students', 'mobile-messages', 'mobile-explore', 'mobile-more', 'notifications', 'profile']
        : ['desktop-home', 'desktop-students', 'desktop-messages', 'desktop-explore', 'desktop-more', 'notifications', 'profile'];
      const found = expectedTargets.filter((target) => document.querySelector(`[data-tour="${target}"]`)).length;
      attempts++;

      logger.log(`Tour polling: found ${found} elements (attempt ${attempts})`);

      if (found === expectedTargets.length || attempts >= maxAttempts) {
        clearInterval(intervalId);
        setStepIndex(0);
        setRunTour(true);
        logger.log('Tour starting with', found, 'elements');
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, [run, isCompactNavigation]);

  const welcomeStep: Step = {
    target: 'body',
    title: 'Chào mừng đến TVU Connect ✨',
    content: (
      <div className="tvu-tour-welcome">
        <span className="tvu-tour-welcome__mark">TVU</span>
        <p>Mất chưa đến một phút để biết nơi tìm bạn, nhắn tin, gọi nhóm, xem bản đồ và học liệu.</p>
        <small>Bạn có thể mở lại hướng dẫn bất cứ lúc nào trong Cài đặt.</small>
      </div>
    ),
    placement: 'center',
  };

  // Compact navigation is used by phones and tablets below the xl breakpoint.
  const mobileSteps: Step[] = [welcomeStep,
    {
      target: '[data-tour="mobile-home"]',
      title: 'Trang chủ',
      content: 'Điểm bắt đầu của bạn — xem hoạt động mới và chọn cách kết nối phù hợp.',
      placement: 'top',
    },
    {
      target: '[data-tour="mobile-students"]',
      title: 'Kết nối',
      content: 'Tìm sinh viên cùng ngành; các kiểu ghép cặp khác nằm trong Tiện ích.',
      placement: 'top',
    },
    {
      target: '[data-tour="mobile-messages"]',
      title: 'Tin nhắn và cuộc gọi',
      content: 'Nhắn tin, gọi thoại, gọi video và tham gia phòng học nhóm ngay tại đây.',
      placement: 'top',
    },
    {
      target: '[data-tour="mobile-explore"]',
      title: 'Quanh bạn',
      content: 'Xem bạn bè công khai vị trí, tìm quán ăn và nhận chỉ đường theo thời gian thực.',
      placement: 'top',
    },
    {
      target: '[data-tour="mobile-more"]',
      title: 'Tiện ích',
      content: 'Mọi tính năng phụ được gom theo nhóm Kết nối, Học tập, Quanh bạn và Cá nhân.',
      placement: 'top',
    },
    {
      target: '[data-tour="notifications"]',
      title: 'Thông báo tập trung',
      content: 'Lời mời kết bạn, tương tác cộng đồng và phát hiện gần bạn được gom về một nơi.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="profile"]',
      title: 'Hồ sơ của bạn',
      content: 'Cập nhật ảnh và sở thích để kết quả kết nối chính xác hơn. Vậy là bạn sẵn sàng rồi!',
      placement: 'bottom',
    },
  ];

  // Desktop steps follow the primary top navigation.
  const desktopSteps: Step[] = [welcomeStep,
    {
      target: '[data-tour="desktop-home"]',
      title: 'Trang chủ',
      content: 'Điểm bắt đầu — xem tổng quan và chọn chế độ kết nối.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="desktop-students"]',
      title: 'Kết nối',
      content: 'Tìm sinh viên cùng ngành hoặc cùng lớp. Ghép cặp nhanh và hẹn hò nằm trong Tiện ích.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="desktop-messages"]',
      title: 'Tin nhắn và cuộc gọi',
      content: 'Nhắn tin, gọi thoại, gọi video và tham gia phòng học nhóm.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="desktop-explore"]',
      title: 'Quanh bạn',
      content: 'Xem bạn bè công khai vị trí, tìm địa điểm và nhận chỉ đường theo thời gian thực.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="desktop-more"]',
      title: 'Tiện ích',
      content: 'Cộng đồng, học liệu, AI, phòng học, hẹn hò và cài đặt được chia nhóm rõ tại đây.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="notifications"]',
      title: 'Trung tâm thông báo',
      content: 'Kết bạn, tương tác cộng đồng và những phát hiện phù hợp đều nằm ở đây.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="profile"]',
      title: 'Hồ sơ',
      content: 'Quản lý thông tin cá nhân để tăng khả năng ghép cặp.',
      placement: 'bottom',
    },
  ];

  const steps = isCompactNavigation ? mobileSteps : desktopSteps;

  const handleEvent = (data: EventData, _controls: Controls) => {
    const { status, type, index, action } = data;

    logger.log('Joyride event:', type, '| status:', status, '| index:', index);

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false);
      setStepIndex(0);
      onComplete?.();
    } else if (type === EVENTS.STEP_AFTER && action === 'next') {
      setStepIndex(index + 1);
    } else if (type === EVENTS.STEP_AFTER && action === 'prev') {
      setStepIndex(index - 1);
    } else if (type === EVENTS.TARGET_NOT_FOUND) {
      logger.warn('Tour target not found, skipping...');
      setStepIndex(prev => prev + 1);
    } else if (type === EVENTS.ERROR) {
      logger.warn('Tour error, stopping tour:', data);
      setRunTour(false);
      onComplete?.();
    }
  };

  return (
    <Joyride
      steps={steps}
      run={runTour}
      stepIndex={stepIndex}
      continuous
      onEvent={handleEvent}
      options={{
        primaryColor: '#6366f1',
        zIndex: 10000,
        arrowColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        overlayColor: theme === 'dark' ? 'rgba(2,6,23,0.82)' : 'rgba(15,23,42,0.58)',
        backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
        textColor: theme === 'dark' ? '#f8fafc' : '#0f172a',
        showProgress: true,
        buttons: ['back', 'skip', 'primary'],
        overlayClickAction: false,
        offset: isCompactNavigation ? 8 : 12,
      }}
      floatingOptions={{ hideArrow: false }}
      styles={{
        tooltip: {
          borderRadius: '22px',
          padding: isCompactNavigation ? '18px' : '22px 24px',
          fontSize: '14px',
          maxWidth: isCompactNavigation ? 'min(330px, calc(100vw - 24px))' : '380px',
          border: theme === 'dark' ? '1px solid rgba(129,140,248,0.34)' : '1px solid rgba(99,102,241,0.18)',
          boxShadow: theme === 'dark'
            ? '0 24px 70px rgba(0,0,0,0.62), 0 0 38px rgba(99,102,241,0.16)'
            : '0 24px 70px rgba(30,41,59,0.24), 0 0 32px rgba(99,102,241,0.12)',
        },
        tooltipTitle: {
          fontSize: isCompactNavigation ? '16px' : '18px',
          fontWeight: '900',
          marginBottom: '8px',
        },
        tooltipContent: {
          padding: '4px 0 0',
          fontSize: isCompactNavigation ? '13px' : '14px',
          lineHeight: '1.6',
          color: theme === 'dark' ? '#cbd5e1' : '#475569',
        },
        buttonPrimary: {
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          borderRadius: '12px',
          padding: isCompactNavigation ? '9px 18px' : '10px 22px',
          fontSize: '13px',
          fontWeight: '700',
          letterSpacing: '0.01em',
        },
        buttonBack: {
          color: theme === 'dark' ? '#9ca3af' : '#6b7280',
          marginRight: '8px',
          fontSize: '13px',
        },
        buttonSkip: {
          color: theme === 'dark' ? '#94a3b8' : '#64748b',
          fontSize: '13px',
          fontWeight: '700',
        },
      }}
      locale={{
        back: '← Quay lại',
        close: 'Đóng',
        last: 'Bắt đầu',
        next: 'Tiếp →',
        nextWithProgress: 'Tiếp ({current}/{total}) →',
        skip: 'Bỏ qua',
        open: 'Mở',
      }}
    />
  );
};

export default OnboardingTour;
