import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { verifyToken } from './auth.crypto';
import type { AuthUser } from './auth.types';

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }

    try {
      const secret = this.config.get<string>('AUTH_JWT_SECRET');
      if (!secret) throw new Error('Authentication is not configured');
      const payload = verifyToken(authorization.slice(7), secret);
      const user = await this.prisma.user.findFirst({
        where: {
          id: payload.id,
          organizationId: payload.organizationId,
          isActive: true,
        },
      });
      if (!user) throw new Error('User is not active');
      request.user = {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        role: user.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired bearer token');
    }
  }
}
