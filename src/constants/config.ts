export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://api.flexgig.com.ng';
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'FlexGig';
export const APP_DESCRIPTION = import.meta.env.VITE_APP_DESCRIPTION || 'Cheap Data Plug';

export const API_ENDPOINTS = {
  // Auth
  AUTH_SESSION: '/api/session',
  AUTH_LOGIN_GOOGLE: '/auth/google',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_RESET_PIN: '/auth/reset-pin',

  // User
  USER_PROFILE: '/api/user/profile',
  USER_UPDATE: '/api/user/profile',

  // Referrals
  REFERRAL_CAMPAIGN: '/api/referrals/campaign',
  REFERRAL_LIST: '/api/referrals/list',
  REFERRAL_HISTORY: '/api/referrals/history',
  REFERRAL_MOVE_TO_WALLET: '/api/referrals/move-to-wallet',

  // Transactions
  TRANSACTION_LIST: '/api/transactions',
  TRANSACTION_DETAILS: '/api/transactions/:id',
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
};

export const STORAGE_KEYS = {
  USER: 'flexgig_user',
  AUTH_TOKEN: 'flexgig_auth_token',
  REFRESH_TOKEN: 'flexgig_refresh_token',
  THEME: 'flexgig_theme',
};

export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  LOGIN: '/login',
  LOGOUT: '/logout',
  PROFILE: '/profile',
  NOT_FOUND: '/404',
};
