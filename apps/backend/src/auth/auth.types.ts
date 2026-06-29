import type { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
}

export interface AuthTokenPayload extends AuthUser {
  exp: number;
  iat: number;
}
