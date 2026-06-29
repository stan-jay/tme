-- CreateEnum
CREATE TYPE "PipelineDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StageRunStatus" AS ENUM ('BLOCKED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PipelinePartitionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PipelineDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "operation" TEXT NOT NULL,
    "status" "PipelineDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceConnectionId" TEXT,
    "destinationConnectionIds" JSONB NOT NULL,
    "knowledgePackIds" JSONB NOT NULL,
    "schedule" JSONB,
    "maxParallelStages" INTEGER NOT NULL DEFAULT 4,
    "maxParallelPartitions" INTEGER NOT NULL DEFAULT 4,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStageDefinition" (
    "id" TEXT NOT NULL,
    "pipelineDefinitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "dependsOn" JSONB NOT NULL,
    "connectionId" TEXT,
    "knowledgePackId" TEXT,
    "configuration" JSONB NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "backoffMs" INTEGER NOT NULL DEFAULT 1000,
    "maxBackoffMs" INTEGER NOT NULL DEFAULT 30000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStageDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pipelineDefinitionId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'QUEUED',
    "initiatedById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "totalStages" INTEGER NOT NULL,
    "completedStages" INTEGER NOT NULL DEFAULT 0,
    "failedStages" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStageRun" (
    "id" TEXT NOT NULL,
    "pipelineRunId" TEXT NOT NULL,
    "stageDefinitionId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "status" "StageRunStatus" NOT NULL DEFAULT 'BLOCKED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "output" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStageRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRunPartition" (
    "id" TEXT NOT NULL,
    "stageRunId" TEXT NOT NULL,
    "partitionKey" TEXT NOT NULL,
    "dependencyLevel" INTEGER NOT NULL,
    "entityTypes" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "status" "PipelinePartitionStatus" NOT NULL DEFAULT 'QUEUED',
    "checkpoint" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineRunPartition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineDefinition_organizationId_status_idx" ON "PipelineDefinition"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineDefinition_organizationId_name_key" ON "PipelineDefinition"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PipelineStageDefinition_pipelineDefinitionId_idx" ON "PipelineStageDefinition"("pipelineDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStageDefinition_pipelineDefinitionId_key_key" ON "PipelineStageDefinition"("pipelineDefinitionId", "key");

-- CreateIndex
CREATE INDEX "PipelineRun_organizationId_status_idx" ON "PipelineRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PipelineRun_pipelineDefinitionId_createdAt_idx" ON "PipelineRun"("pipelineDefinitionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_organizationId_idempotencyKey_key" ON "PipelineRun"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PipelineStageRun_status_queuedAt_idx" ON "PipelineStageRun"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "PipelineStageRun_pipelineRunId_status_idx" ON "PipelineStageRun"("pipelineRunId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStageRun_pipelineRunId_stageKey_key" ON "PipelineStageRun"("pipelineRunId", "stageKey");

-- CreateIndex
CREATE INDEX "PipelineRunPartition_stageRunId_dependencyLevel_status_idx" ON "PipelineRunPartition"("stageRunId", "dependencyLevel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRunPartition_stageRunId_partitionKey_key" ON "PipelineRunPartition"("stageRunId", "partitionKey");

-- AddForeignKey
ALTER TABLE "PipelineDefinition" ADD CONSTRAINT "PipelineDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageDefinition" ADD CONSTRAINT "PipelineStageDefinition_pipelineDefinitionId_fkey" FOREIGN KEY ("pipelineDefinitionId") REFERENCES "PipelineDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_pipelineDefinitionId_fkey" FOREIGN KEY ("pipelineDefinitionId") REFERENCES "PipelineDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageRun" ADD CONSTRAINT "PipelineStageRun_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageRun" ADD CONSTRAINT "PipelineStageRun_stageDefinitionId_fkey" FOREIGN KEY ("stageDefinitionId") REFERENCES "PipelineStageDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRunPartition" ADD CONSTRAINT "PipelineRunPartition_stageRunId_fkey" FOREIGN KEY ("stageRunId") REFERENCES "PipelineStageRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
