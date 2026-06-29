import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

interface RateBucket {
  count: number;
  resetAt: number;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const config = app.get(ConfigService);
  validateConfiguration(config);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => new BadRequestException(errors),
    }),
  );

  const allowedOrigins = (config.get<string>('CORS_ORIGINS') || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  app.use(securityHeaders);
  app.use(createRateLimiter(120, 60_000));

  const port = config.get<number>('PORT') || 4000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}

function validateConfiguration(config: ConfigService): void {
  const required = ['DATABASE_URL', 'AUTH_JWT_SECRET'];
  const missing = required.filter((key) => !config.get<string>(key));
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  if ((config.get<string>('AUTH_JWT_SECRET') || '').length < 32) {
    throw new Error('AUTH_JWT_SECRET must contain at least 32 characters');
  }
}

function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
}

function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, RateBucket>();
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count++;
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > limit) {
      response.status(429).json({ statusCode: 429, message: 'Too many requests' });
      return;
    }
    next();
  };
}

bootstrap();
