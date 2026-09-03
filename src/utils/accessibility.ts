import React from 'react';

/**
 * Accessibility utility functions and props
 * Giúp người khuyết tật sử dụng app dễ dàng hơn
 */

export const a11yProps = {
  button: (label: string, pressed?: boolean) => ({
    'aria-label': label,
    role: 'button',
    tabIndex: 0,
    ...(pressed !== undefined && { 'aria-pressed': pressed }),
  }),

  modal: (title: string, isOpen: boolean) => ({
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': `${title}-title`,
    'aria-hidden': !isOpen,
  }),

  liveRegion: (type: 'polite' | 'assertive' = 'polite') => ({
    role: 'status',
    'aria-live': type,
    'aria-atomic': true,
  }),

  input: (label: string, required: boolean = false, invalid: boolean = false) => ({
    'aria-label': label,
    'aria-required': required,
    'aria-invalid': invalid,
  }),
};

/**
 * Keyboard event handler for clickable elements
 * Cho phép dùng phím Enter/Space thay vì chuột
 */
export const handleKeyboardClick = (
  callback: () => void
) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    callback();
  }
};

/**
 * Focus trap hook for modals
 * Giữ focus trong modal, không cho Tab ra ngoài
 */
export const useFocusTrap = (isActive: boolean) => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isActive || !ref.current) return;

    const element = ref.current;
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Modal should handle close on escape
        const closeButton = element.querySelector('[data-close-modal]') as HTMLElement;
        closeButton?.click();
      }
    };

    element.addEventListener('keydown', handleTabKey);
    element.addEventListener('keydown', handleEscape);
    firstElement?.focus();

    return () => {
      element.removeEventListener('keydown', handleTabKey);
      element.removeEventListener('keydown', handleEscape);
    };
  }, [isActive]);

  return ref;
};
