export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
};

export const isValidPassword = (password: string): boolean => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

export const isValidPIN = (pin: string): boolean => {
  // 4-6 digit PIN
  return /^\d{4,6}$/.test(pin);
};

export const isValidUsername = (username: string): boolean => {
  // 3-40 characters, alphanumeric, dots, dashes, underscores only
  return /^[a-z0-9._-]{3,40}$/i.test(username);
};

export const validateRequired = (value: string | undefined | null): boolean => {
  return Boolean(value && value.trim().length > 0);
};
