export interface User {
  id: string;
  email: string;
  username?: string;
  fullName?: string;
  profilePicture?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  message?: string;
  error?: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  token?: string;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
}

export interface WebAuthnOptions {
  challenge: string;
  timeout: number;
  userVerification: 'required' | 'preferred' | 'discouraged';
}
