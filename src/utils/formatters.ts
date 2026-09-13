import { format, formatDistance, parseISO } from 'date-fns';
import { DATE_FORMATS } from './constants';

export const formatCurrency = (amount: number, currency = 'NGN'): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-NG').format(num);
};

export const formatDate = (date: string | Date, formatStr = DATE_FORMATS.DISPLAY): string => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error);
    return date.toString();
  }
};

export const formatDistanceFromNow = (date: string | Date): string => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return formatDistance(dateObj, new Date(), { addSuffix: true });
  } catch (error) {
    console.error('Error formatting distance:', error);
    return '';
  }
};

export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  // Format as +234 XXX XXX XXXX
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return `+234${cleaned.slice(1)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('234')) {
    return `+${cleaned}`;
  }
  return phone;
};

export const formatUsername = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '').slice(0, 40);
};
