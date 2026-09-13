import React from 'react';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

/**
 * Reusable button component
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      primary: 'bg-p1 text-white hover:bg-blue-600 disabled:bg-gray-400',
      secondary: 'bg-gray-200 text-black hover:bg-gray-300 disabled:bg-gray-400',
      danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400',
    };

    const sizeClasses = {
      sm: 'px-2 py-1 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          'rounded-md font-medium transition-colors',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {isLoading ? '...' : children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
