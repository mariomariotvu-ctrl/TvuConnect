import React, { useState, useEffect, useRef } from 'react';
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
  const isMobileRef = useRef(window.innerWidth < 768);
  const isMobile = isMobileRef.current;

  useEffect(() => {
    if (!run) {
      setRunTour(false);
      setStepIndex(0);
      return;
    }

    logger.log('🎯 Tour trigger: true | Mobile:', isMobile);

    // Poll until nav elements are in the DOM
    let attempts = 0;
    const maxAttempts = 30;
    const intervalId = setInterval(() => {
      const found = document.querySelectorAll('[data-tour]').length;
      attempts++;

      logger.log(`🔍 Tour polling: found ${found} elements (attempt ${attempts})`);

      if (found >= 3 || attempts >= maxAttempts) {
        clearInterval(intervalId);
        setStepIndex(0);
        setRunTour(true);
        logger.log('✅ Tour starting with', found, 'elements');
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, [run, isMobile]);

  // Mobile steps target the bottom nav bar (6 items, no "matching")
  const mobileSteps: Step[] = [
    {
      target: '[data-tour="home"]',
      title: '🏠 Trang chủ',
      content: 'Điểm bắt đầu của bạn — xem tổng quan và chọn chế độ kết nối.',
      placement: 'top',
    },
    {
      target: '[data-tour="messages"]',
      title: '💬 Tin nhắn',
      content: 'Trò chuyện riêng tư với những người bạn đã kết nối.',
      placement: 'top',
    },
    {
      target: '[data-tour="posts"]',
      title: '📰 Bảng tin',
      content: 'Đăng bài, chia sẻ khoảnh khắc và tương tác với cộng đồng sinh viên.',
      placement: 'top',
    },
    {
      target: '[data-tour="documents"]',
      title: '📚 Tài liệu',
      content: 'Tìm và chia sẻ tài liệu học tập hữu ích với mọi người.',
      placement: 'top',
    },
    {
      target: '[data-tour="explore"]',
      title: '📍 Khám phá',
      content: 'Tìm địa điểm, quán ăn và sự kiện thú vị quanh trường.',
      placement: 'top',
    },
    {
      target: '[data-tour="profile"]',
      title: '👤 Hồ sơ',
      content: 'Quản lý thông tin cá nhân để tăng khả năng được ghép cặp phù hợp.',
      placement: 'top',
    },
  ];

  // Desktop steps target the top nav bar (7 items including "matching")
  const desktopSteps: Step[] = [
    {
      target: '[data-tour="home"]',
      title: '🏠 Trang chủ',
      content: 'Điểm bắt đầu — xem tổng quan và chọn chế độ kết nối.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="matching"]',
      title: '💘 Ghép cặp',
      content: 'Tìm bạn học, bạn cùng sở thích hoặc người yêu phù hợp với bạn.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="messages"]',
      title: '💬 Tin nhắn',
      content: 'Trò chuyện riêng tư với những người bạn đã kết nối.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="posts"]',
      title: '📰 Bảng tin',
      content: 'Đăng bài và tương tác với cộng đồng sinh viên TVU.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="documents"]',
      title: '📚 Tài liệu',
      content: 'Tìm và chia sẻ tài liệu học tập hữu ích.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="explore"]',
      title: '📍 Khám phá',
      content: 'Tìm địa điểm, quán ăn và sự kiện thú vị quanh trường.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="profile"]',
      title: '👤 Hồ sơ',
      content: 'Quản lý thông tin cá nhân để tăng khả năng ghép cặp.',
      placement: 'bottom',
    },
  ];

  const steps = isMobile ? mobileSteps : desktopSteps;

  const handleEvent = (data: EventData, _controls: Controls) => {
    const { status, type, index, action } = data;

    logger.log('🎯 Joyride event:', type, '| status:', status, '| index:', index);

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false);
      setStepIndex(0);
      onComplete?.();
    } else if (type === EVENTS.STEP_AFTER && action === 'next') {
      setStepIndex(index + 1);
    } else if (type === EVENTS.STEP_AFTER && action === 'prev') {
      setStepIndex(index - 1);
    } else if (type === EVENTS.TARGET_NOT_FOUND) {
      logger.warn('⚠️ Tour target not found, skipping...');
      setStepIndex(prev => prev + 1);
    } else if (type === EVENTS.ERROR) {
      logger.warn('⚠️ Tour error, stopping tour:', data);
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
        overlayColor: theme === 'dark' ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.45)',
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        textColor: theme === 'dark' ? '#f3f4f6' : '#111827',
        showProgress: true,
        buttons: ['back', 'skip', 'primary'],
        overlayClickAction: false,
        offset: isMobile ? 6 : 10,
      }}
      floatingOptions={{ hideArrow: false }}
      styles={{
        tooltip: {
          borderRadius: '16px',
          padding: isMobile ? '16px 18px' : '20px 24px',
          fontSize: '14px',
          maxWidth: isMobile ? '290px' : '360px',
          boxShadow: theme === 'dark'
            ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.2)'
            : '0 20px 60px rgba(0,0,0,0.15)',
        },
        tooltipTitle: {
          fontSize: isMobile ? '15px' : '16px',
          fontWeight: '800',
          marginBottom: '8px',
        },
        tooltipContent: {
          padding: '4px 0 0',
          fontSize: isMobile ? '13px' : '14px',
          lineHeight: '1.5',
          color: theme === 'dark' ? '#d1d5db' : '#374151',
        },
        buttonPrimary: {
          backgroundColor: '#6366f1',
          borderRadius: '10px',
          padding: isMobile ? '8px 18px' : '8px 20px',
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
          color: theme === 'dark' ? '#6b7280' : '#9ca3af',
          fontSize: '13px',
        },
      }}
      locale={{
        back: '← Quay lại',
        close: 'Đóng',
        last: '🎉 Bắt đầu!',
        next: 'Tiếp →',
        skip: 'Bỏ qua',
        open: 'Mở',
      }}
    />
  );
};

export default OnboardingTour;
