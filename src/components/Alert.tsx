import React from 'react';
import clsx from 'clsx';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
  dismissible?: boolean;
}

/**
 * Alert/Toast notification component
 */
const Alert: React.FC<AlertProps> = ({ type, message, onClose, dismissible = true }) => {
  const typeClasses = {
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  };

  const iconClasses = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div className={clsx('border rounded-lg p-4 flex items-center gap-3', typeClasses[type])}>
      <span className="text-lg font-bold">{iconClasses[type]}</span>
      <p className="flex-1">{message}</p>
      {dismissible && (
        <button
          onClick={onClose}
          className="text-lg font-bold hover:opacity-70 transition"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default Alert;
