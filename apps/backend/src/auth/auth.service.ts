import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, signToken, verifyPassword } from './auth.crypto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('BOOTSTRAP_ADMIN_EMAIL')?.toLowerCase();
    const password = this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD');
    const organizationName = this.config.get<string>('BOOTSTRAP_ORGANIZATION_NAME') || 'TME';
    const organizationSlug = this.config.get<string>('BOOTSTRAP_ORGANIZATION_SLUG') || 'tme';
    if (!email || !password) return;

    const organization = await this.prisma.organization.upsert({
      where: { slug: organizationSlug },
      update: { name: organizationName },
      create: { name: organizationName, slug: organizationSlug },
    });

    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: organization.id, email } },
    });
    if (!existing) {
      await this.prisma.user.create({
        data: {
          organizationId: organization.id,
          email,
          name: 'TME Administrator',
          role: UserRole.ADMIN,
          passwordHash: await hashPassword(password),
        },
      });
      this.logger.warn(`Bootstrap administrator created for ${email}; rotate the bootstrap password.`);
    }
  }

  async login(organizationSlug: string, email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        isActive: true,
        organization: { slug: organizationSlug },
      },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const secret = this.getSecret();
    const ttlSeconds = Number(this.config.get<string>('AUTH_TOKEN_TTL_SECONDS') || 3600);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken: signToken(
        {
          id: user.id,
          organizationId: user.organizationId,
          email: user.email,
          role: user.role,
        },
        secret,
        ttlSeconds,
      ),
      expiresIn: ttlSeconds,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new UnauthorizedException('New password must differ from the current password');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.password.change',
        entityType: 'user',
        entityId: user.id,
        outcome: 'success',
      },
    });
  }

  getSecret(): string {
    const secret = this.config.get<string>('AUTH_JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error('AUTH_JWT_SECRET must contain at least 32 characters');
    }
    return secret;
  }
}
