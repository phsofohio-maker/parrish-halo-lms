import React from 'react';
import { cn } from '../../utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading,
  disabled,
  ...props
}) => {
  const variants = {
    primary: 'bg-primary-800 text-white hover:bg-primary-700 active:bg-primary-900 shadow-xs hover:shadow-sm',
    secondary: 'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100',
    danger: 'bg-critical-600 text-white hover:bg-red-700 shadow-xs hover:shadow-sm',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-600',
    outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 hover:border-gray-400 text-gray-700'
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-5 text-sm',
    lg: 'h-12 px-6 text-base'
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:pointer-events-none disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:opacity-100',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.75} />}
      {children}
    </button>
  );
};
