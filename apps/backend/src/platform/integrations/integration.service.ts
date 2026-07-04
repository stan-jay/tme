import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConnectionStatus, Prisma } from '@prisma/client';
import type { CapabilityContext, ConfigurationField } from '@tme/connector-sdk';
import type { SJBLEntityType } from '@tme/shared';
import type { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PluginRegistryService } from '../plugin-registry/plugin-registry.service';
import { IntegrationCryptoService } from './integration-crypto.service';
import type {
  CreateIntegrationConnectionDto,
  PullIntegrationRecordsDto,
  UpdateIntegrationConnectionDto,
  UpdatePluginCatalogDto,
} from './dto/integration.dto';

@Injectable()
export class IntegrationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plugins: PluginRegistryService,
    private readonly crypto: IntegrationCryptoService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    // PluginBootstrapService registers built-ins during the same lifecycle.
    // Deferring one microtask ensures manifests are present before synchronization.
    await Promise.resolve();
    await this.syncInstalledPlugins();
  }

  async syncInstalledPlugins(): Promise<void> {
    for (const plugin of this.plugins.list()) {
      await this.prisma.pluginCatalog.upsert({
        where: { id: plugin.manifest.id },
        update: {
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          category: plugin.manifest.category,
          manifest: this.json(plugin.manifest),
          installed: true,
        },
        create: {
          id: plugin.manifest.id,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          category: plugin.manifest.category,
          manifest: this.json(plugin.manifest),
          installed: true,
        },
      });
    }
  }

  async listCatalog() {
    await this.syncInstalledPlugins();
    return this.prisma.pluginCatalog.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  async updateCatalog(pluginId: string, body: UpdatePluginCatalogDto, user: AuthUser) {
    const current = await this.requireCatalog(pluginId);
    const prospective = { ...current, ...body };
    if (
      (prospective.globalEnabled ||
        prospective.newConnectionsAllowed ||
        prospective.existingConnectionsAllowed) &&
      (prospective.technicalStatus !== 'TECHNICALLY_VERIFIED' ||
        prospective.commercialStatus !== 'APPROVED')
    ) {
      throw new ConflictException(
        'A plugin must be technically verified and commercially approved before it can be enabled',
      );
    }
    const updated = await this.prisma.pluginCatalog.update({
      where: { id: pluginId },
      data: body,
    });
    await this.audit.record({
      user,
      action: 'integration.catalog.update',
      entityType: 'plugin',
      entityId: pluginId,
      details: body,
    });
    return updated;
  }

  async listConnections(organizationId: string) {
    const connections = await this.prisma.integrationConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { plugin: true },
    });
    return connections.map((connection) => this.sanitize(connection));
  }

  async listAvailableConnections(organizationId: string) {
    const connections = await this.prisma.integrationConnection.findMany({
      where: {
        organizationId,
        enabled: true,
        status: ConnectionStatus.CONNECTED,
        plugin: {
          globalEnabled: true,
          existingConnectionsAllowed: true,
          technicalStatus: 'TECHNICALLY_VERIFIED',
          commercialStatus: 'APPROVED',
        },
      },
      include: { plugin: true },
      orderBy: { name: 'asc' },
    });
    return connections.map((connection) => {
      const manifest = connection.plugin.manifest as {
        capabilities?: string[];
        supportedEntityTypes?: string[];
      };
      return {
        id: connection.id,
        name: connection.name,
        pluginId: connection.pluginId,
        pluginName: connection.plugin.name,
        category: connection.plugin.category,
        capabilities: manifest.capabilities || [],
        supportedEntityTypes: manifest.supportedEntityTypes || [],
      };
    });
  }

  async create(body: CreateIntegrationConnectionDto, user: AuthUser) {
    const catalog = await this.requireCatalog(body.pluginId);
    if (
      !catalog.globalEnabled ||
      !catalog.newConnectionsAllowed ||
      catalog.technicalStatus !== 'TECHNICALLY_VERIFIED' ||
      catalog.commercialStatus !== 'APPROVED'
    ) {
      throw new ConflictException('This integration is not available for new connections');
    }
    const plugin = this.plugins.get(body.pluginId);
    const configuration = this.validateConfiguration(
      plugin.manifest.configurationSchema,
      body.publicConfiguration,
      body.secrets,
      false,
    );
    const connection = await this.prisma.integrationConnection.create({
      data: {
        organizationId: user.organizationId,
        pluginId: body.pluginId,
        name: body.name.trim(),
        publicConfiguration: this.json(configuration.publicConfiguration),
        encryptedSecrets: this.crypto.encrypt(configuration.secrets),
        encryptionKeyId: this.crypto.keyId,
        createdById: user.id,
        updatedById: user.id,
        status: ConnectionStatus.PENDING_TEST,
      },
      include: { plugin: true },
    });
    await this.audit.record({
      user,
      action: 'integration.connection.create',
      entityType: 'integration_connection',
      entityId: connection.id,
      details: { pluginId: body.pluginId, name: body.name },
    });
    return this.sanitize(connection);
  }

  async update(
    id: string,
    body: UpdateIntegrationConnectionDto,
    user: AuthUser,
  ) {
    const connection = await this.getOwned(id, user.organizationId);
    const plugin = this.plugins.get(connection.pluginId);
    const previousPublic = this.object(connection.publicConfiguration);
    const previousSecrets = this.crypto.decrypt(connection.encryptedSecrets);
    const mergedPublic = { ...previousPublic, ...(body.publicConfiguration || {}) };
    const mergedSecrets = { ...previousSecrets, ...(body.secrets || {}) };
    const configuration = this.validateConfiguration(
      plugin.manifest.configurationSchema,
      mergedPublic,
      mergedSecrets,
      true,
    );

    if (body.enabled) {
      if (!connection.plugin.globalEnabled || !connection.plugin.existingConnectionsAllowed) {
        throw new ConflictException('This integration is not currently allowed to operate');
      }
      if (!connection.lastTestSucceeded) {
        throw new ConflictException('Test the connection successfully before enabling it');
      }
    }

    const configurationChanged = Boolean(body.publicConfiguration || body.secrets);
    const updated = await this.prisma.integrationConnection.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        publicConfiguration: this.json(configuration.publicConfiguration),
        encryptedSecrets: this.crypto.encrypt(configuration.secrets),
        encryptionKeyId: this.crypto.keyId,
        enabled: configurationChanged ? false : body.enabled,
        status:
          configurationChanged
            ? ConnectionStatus.PENDING_TEST
            : body.enabled === true
              ? ConnectionStatus.CONNECTED
              : body.enabled === false
            ? ConnectionStatus.DISABLED
            : undefined,
        lastTestSucceeded:
          configurationChanged ? null : undefined,
        updatedById: user.id,
      },
      include: { plugin: true },
    });
    await this.audit.record({
      user,
      action: 'integration.connection.update',
      entityType: 'integration_connection',
      entityId: id,
      details: {
        nameChanged: body.name !== undefined,
        configurationChanged,
        enabled: body.enabled,
      },
    });
    return this.sanitize(updated);
  }

  async test(id: string, user: AuthUser) {
    const connection = await this.getOwned(id, user.organizationId);
    const plugin = this.plugins.get(connection.pluginId);
    const tester = plugin.reader || plugin.writer;
    if (!tester) throw new BadRequestException('Plugin has no testable connection capability');
    const configuration = {
      ...this.object(connection.publicConfiguration),
      ...this.crypto.decrypt(connection.encryptedSecrets),
    };
    const context: CapabilityContext = {
      organizationId: user.organizationId,
      connectionId: connection.id,
      pipelineRunId: `connection-test:${connection.id}`,
      configuration,
    };
    const result = await tester.testConnection(context);
    await this.prisma.integrationConnection.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestSucceeded: result.connected,
        lastTestMessage: result.message.slice(0, 1000),
        status: result.connected ? ConnectionStatus.CONNECTED : ConnectionStatus.FAILING,
        enabled: result.connected ? connection.enabled : false,
        updatedById: user.id,
      },
    });
    await this.audit.record({
      user,
      action: 'integration.connection.test',
      entityType: 'integration_connection',
      entityId: id,
      outcome: result.connected ? 'success' : 'failed',
      details: { message: result.message, capabilities: result.capabilities },
    });
    return result;
  }

  async discoverResources(id: string, user: AuthUser) {
    const runtime = await this.runtimeConfiguration(id, user.organizationId);
    if (!runtime.capabilities.includes('read')) {
      throw new BadRequestException('Integration connection does not provide a reader capability');
    }
    const reader = this.plugins.reader(runtime.pluginId);
    const result = await reader.discover({
      organizationId: user.organizationId,
      connectionId: id,
      pipelineRunId: `connection-discover:${id}`,
      configuration: runtime.configuration,
    });
    await this.audit.record({
      user,
      action: 'integration.connection.discover',
      entityType: 'integration_connection',
      entityId: id,
      outcome: 'success',
      details: { resourceCount: result.resources.length },
    });
    return result;
  }

  async pullRecords(id: string, body: PullIntegrationRecordsDto, user: AuthUser) {
    const runtime = await this.runtimeConfiguration(id, user.organizationId);
    if (!runtime.capabilities.includes('read')) {
      throw new BadRequestException('Integration connection does not provide a reader capability');
    }
    const reader = this.plugins.reader(runtime.pluginId);
    const pages = reader.read(
      {
        resourceId: body.resourceId,
        entityTypes: body.entityTypes as SJBLEntityType[] | undefined,
        cursor: body.cursor,
        pageSize: body.pageSize || 25,
        changedSince: body.changedSince,
      },
      {
        organizationId: user.organizationId,
        connectionId: id,
        pipelineRunId: `connection-pull:${id}`,
        configuration: runtime.configuration,
      },
    );
    for await (const page of pages) {
      await this.audit.record({
        user,
        action: 'integration.connection.pull_preview',
        entityType: 'integration_connection',
        entityId: id,
        outcome: 'success',
        details: {
          resourceId: body.resourceId,
          recordCount: page.records.length,
          complete: page.complete,
        },
      });
      return page;
    }
    return { records: [], complete: true };
  }

  async runtimeConfiguration(id: string, organizationId: string) {
    const connection = await this.getOwned(id, organizationId);
    if (!connection.enabled || connection.status !== ConnectionStatus.CONNECTED) {
      throw new ConflictException('Integration connection is not enabled and connected');
    }
    if (
      !connection.plugin.globalEnabled ||
      !connection.plugin.existingConnectionsAllowed ||
      connection.plugin.technicalStatus !== 'TECHNICALLY_VERIFIED' ||
      connection.plugin.commercialStatus !== 'APPROVED'
    ) {
      throw new ConflictException('Integration has been suspended globally');
    }
    return {
      pluginId: connection.pluginId,
      capabilities: ((connection.plugin.manifest as { capabilities?: string[] }).capabilities || []),
      supportedEntityTypes:
        ((connection.plugin.manifest as { supportedEntityTypes?: string[] }).supportedEntityTypes || []),
      configuration: {
        ...this.object(connection.publicConfiguration),
        ...this.crypto.decrypt(connection.encryptedSecrets),
      },
    };
  }

  async remove(id: string, user: AuthUser) {
    const connection = await this.getOwned(id, user.organizationId);
    if (connection.enabled) {
      throw new ConflictException('Disable the integration connection before deleting it');
    }
    await this.prisma.integrationConnection.delete({ where: { id } });
    await this.audit.record({
      user,
      action: 'integration.connection.delete',
      entityType: 'integration_connection',
      entityId: id,
      details: { pluginId: connection.pluginId, name: connection.name },
    });
    return { message: 'Integration connection deleted' };
  }

  private async getOwned(id: string, organizationId: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, organizationId },
      include: { plugin: true },
    });
    if (!connection) throw new NotFoundException('Integration connection not found');
    return connection;
  }

  private async requireCatalog(pluginId: string) {
    await this.syncInstalledPlugins();
    const catalog = await this.prisma.pluginCatalog.findUnique({ where: { id: pluginId } });
    if (!catalog || !catalog.installed) throw new NotFoundException('Plugin is not installed');
    return catalog;
  }

  private validateConfiguration(
    fields: ConfigurationField[],
    publicConfiguration: Record<string, unknown>,
    secrets: Record<string, unknown>,
    allowExistingSecrets: boolean,
  ) {
    const allowed = new Set(fields.map((field) => field.key));
    for (const key of [...Object.keys(publicConfiguration), ...Object.keys(secrets)]) {
      if (!allowed.has(key)) throw new BadRequestException(`Unknown configuration field ${key}`);
    }
    for (const field of fields) {
      const expectedSecret = field.secret || field.type === 'secret';
      if (expectedSecret && field.key in publicConfiguration) {
        throw new BadRequestException(`${field.key} must be submitted as a secret`);
      }
      if (!expectedSecret && field.key in secrets) {
        throw new BadRequestException(`${field.key} is not a secret field`);
      }
      const value = expectedSecret ? secrets[field.key] : publicConfiguration[field.key];
      if (field.required && !this.present(value) && !allowExistingSecrets) {
        throw new BadRequestException(`${field.label} is required`);
      }
      if (this.present(value)) this.validateField(field, value);
    }
    return { publicConfiguration, secrets };
  }

  private validateField(field: ConfigurationField, value: unknown): void {
    if (field.type === 'boolean' && typeof value !== 'boolean') {
      throw new BadRequestException(`${field.label} must be a boolean`);
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      throw new BadRequestException(`${field.label} must be a number`);
    }
    if (field.type === 'url') {
      try {
        const parsed = new URL(String(value));
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        throw new BadRequestException(`${field.label} must be a valid HTTP(S) URL`);
      }
    }
    if (field.type === 'select' && !field.options?.some((option) => option.value === value)) {
      throw new BadRequestException(`${field.label} has an unsupported value`);
    }
  }

  private sanitize(connection: any) {
    const secretFields = (
      (connection.plugin.manifest as { configurationSchema?: ConfigurationField[] })
        .configurationSchema || []
    )
      .filter((field) => field.secret || field.type === 'secret')
      .map((field) => field.key);
    return {
      id: connection.id,
      organizationId: connection.organizationId,
      pluginId: connection.pluginId,
      plugin: {
        id: connection.plugin.id,
        name: connection.plugin.name,
        category: connection.plugin.category,
        manifest: connection.plugin.manifest,
        globalEnabled: connection.plugin.globalEnabled,
        newConnectionsAllowed: connection.plugin.newConnectionsAllowed,
        existingConnectionsAllowed: connection.plugin.existingConnectionsAllowed,
      },
      name: connection.name,
      status: connection.status,
      enabled: connection.enabled,
      publicConfiguration: connection.publicConfiguration,
      configuredSecretFields: connection.encryptedSecrets ? secretFields : [],
      lastTestedAt: connection.lastTestedAt,
      lastTestSucceeded: connection.lastTestSucceeded,
      lastTestMessage: connection.lastTestMessage,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private object(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private present(value: unknown): boolean {
    return value !== undefined && value !== null && value !== '';
  }
}
