-- CreateEnum
CREATE TYPE "PluginTechnicalStatus" AS ENUM ('RESEARCHING', 'SANDBOX_AVAILABLE', 'IN_DEVELOPMENT', 'TECHNICALLY_VERIFIED', 'SUSPENDED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PluginCommercialStatus" AS ENUM ('NOT_STARTED', 'IN_DISCUSSION', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('DRAFT', 'PENDING_TEST', 'CONNECTED', 'FAILING', 'DISABLED');

-- CreateTable
CREATE TABLE "PluginCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "installed" BOOLEAN NOT NULL DEFAULT true,
    "technicalStatus" "PluginTechnicalStatus" NOT NULL DEFAULT 'RESEARCHING',
    "commercialStatus" "PluginCommercialStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "globalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "newConnectionsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "existingConnectionsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicConfiguration" JSONB NOT NULL,
    "encryptedSecrets" TEXT,
    "encryptionKeyId" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestSucceeded" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PluginCatalog_category_idx" ON "PluginCatalog"("category");

-- CreateIndex
CREATE INDEX "PluginCatalog_globalEnabled_idx" ON "PluginCatalog"("globalEnabled");

-- CreateIndex
CREATE INDEX "IntegrationConnection_organizationId_pluginId_idx" ON "IntegrationConnection"("organizationId", "pluginId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_organizationId_status_idx" ON "IntegrationConnection"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_name_key" ON "IntegrationConnection"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
