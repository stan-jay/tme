-- CreateTable
CREATE TABLE "MappingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceSignature" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "mappings" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MappingProfile_organizationId_idx" ON "MappingProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MappingProfile_organizationId_sourceSignature_key" ON "MappingProfile"("organizationId", "sourceSignature");

-- AddForeignKey
ALTER TABLE "MappingProfile" ADD CONSTRAINT "MappingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
