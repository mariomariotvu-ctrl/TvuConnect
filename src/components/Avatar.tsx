import { useState, useEffect, useRef } from 'react';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  fallbackText: string;
  onClick?: () => void;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg'
};

export function Avatar({ 
  src, 
  alt, 
  size = 'md', 
  fallbackText, 
  onClick, 
  className = '' 
}: AvatarProps) {
  const [imageSrc, setImageSrc] = useState<string | undefined>(undefined);
  const [imageError, setImageError] = useState(false);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px'
      }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, []);

  // Load image only when in viewport
  useEffect(() => {
    if (isIntersecting && src && !imageError) {
      setImageSrc(src);
    }
  }, [isIntersecting, src, imageError]);

  const handleImageError = () => {
    setImageError(true);
    setImageSrc(undefined);
  };

  const firstLetter = fallbackText.charAt(0).toUpperCase();
  
  // Generate consistent color based on first letter
  const getBackgroundColor = (letter: string) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500'
    ];
    const index = letter.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const baseClasses = `
    ${sizeClasses[size]}
    rounded-full
    flex items-center justify-center
    border-2 border-gray-300 dark:border-gray-600
    overflow-hidden
    flex-shrink-0
    ${onClick ? 'cursor-pointer hover:scale-105 transition-transform duration-200' : ''}
    ${className}
  `;

  if (!imageSrc || imageError) {
    // Fallback avatar with first letter
    return (
      <div
        ref={imgRef}
        className={`${baseClasses} ${getBackgroundColor(firstLetter)} text-white font-semibold`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        aria-label={onClick ? `View profile of ${alt}` : alt}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        } : undefined}
      >
        {firstLetter}
      </div>
    );
  }

  return (
    <div
      ref={imgRef}
      className={baseClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? `View profile of ${alt}` : alt}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <img
        src={imageSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        onError={handleImageError}
        referrerPolicy="no-referrer"
        style={{
          imageRendering: '-webkit-optimize-contrast',
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
        }}
      />
    </div>
  );
}
