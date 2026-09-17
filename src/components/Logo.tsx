import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { mark: 'h-9 w-9 text-[11px]', label: 'text-lg' },
  md: { mark: 'h-12 w-12 text-sm', label: 'text-2xl' },
  lg: { mark: 'h-16 w-16 text-lg', label: 'text-3xl md:text-4xl' },
  xl: { mark: 'h-20 w-20 text-xl', label: 'text-4xl md:text-5xl' },
};

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const current = sizes[size];

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <span
        aria-hidden="true"
        className={`${current.mark} grid shrink-0 place-items-center rounded-xl bg-indigo-600 font-extrabold tracking-tight text-white shadow-sm dark:bg-indigo-500`}
      >
        TVU
      </span>
      {showText && (
        <span className={`${current.label} font-extrabold tracking-[-0.035em] text-slate-950 dark:text-white`}>
          TVU Connect
        </span>
      )}
    </div>
  );
};
