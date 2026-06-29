import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff']);

@Injectable()
export class UploadService {
  private readonly root = resolve(process.cwd(), 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async store(file: Express.Multer.File | undefined, user: AuthUser) {
    if (!file) throw new BadRequestException('A file is required');
    const extension = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Only CSV, XLSX, XLS, PDF and common image files are accepted');
    }
    this.assertSignature(file.buffer, extension);

    const organizationDirectory = resolve(this.root, user.organizationId);
    const storagePath = resolve(organizationDirectory, `${randomUUID()}${extension}`);
    if (!storagePath.startsWith(`${organizationDirectory}\\`) && !storagePath.startsWith(`${organizationDirectory}/`)) {
      throw new BadRequestException('Invalid storage path');
    }

    await fs.mkdir(organizationDirectory, { recursive: true });
    await fs.writeFile(storagePath, file.buffer, { flag: 'wx' });
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const retentionDays = Number(this.config.get<string>('UPLOAD_RETENTION_DAYS') || 30);

    return this.prisma.upload.create({
      data: {
        organizationId: user.organizationId,
        uploadedById: user.id,
        originalName: file.originalname,
        storagePath,
        mimeType: file.mimetype || 'application/octet-stream',
        extension,
        sizeBytes: file.size,
        sha256,
        expiresAt: new Date(Date.now() + retentionDays * 86_400_000),
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        expiresAt: true,
      },
    });
  }

  async resolveOwned(uploadId: string, organizationId: string) {
    const upload = await this.prisma.upload.findFirst({
      where: { id: uploadId, organizationId, status: 'STORED' },
    });
    if (!upload) throw new NotFoundException('Upload not found');
    const resolved = resolve(upload.storagePath);
    const tenantRoot = resolve(this.root, organizationId);
    if (!resolved.startsWith(`${tenantRoot}\\`) && !resolved.startsWith(`${tenantRoot}/`)) {
      throw new BadRequestException('Upload storage path is outside the tenant boundary');
    }
    return upload;
  }

  private assertSignature(buffer: Buffer, extension: string): void {
    if (!buffer.length) throw new BadRequestException('The uploaded file is empty');
    if (extension === '.xlsx' && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
      throw new BadRequestException('The XLSX file signature is invalid');
    }
    if (
      extension === '.xls' &&
      !buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    ) {
      throw new BadRequestException('The XLS file signature is invalid');
    }
    if (extension === '.csv' && buffer.includes(0)) {
      throw new BadRequestException('The CSV file contains binary data');
    }
    if (extension === '.pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('The PDF file signature is invalid');
    }
    if (extension === '.png' && !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      throw new BadRequestException('The PNG file signature is invalid');
    }
    if ((extension === '.jpg' || extension === '.jpeg') && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9)) {
      throw new BadRequestException('The JPEG file signature is invalid');
    }
    if (
      (extension === '.tif' || extension === '.tiff') &&
      !(
        buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
        buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
      )
    ) {
      throw new BadRequestException('The TIFF file signature is invalid');
    }
  }
}
