-- Store reviewed canonical SJBL drafts (for scans/OCR/API handoffs) on the
-- governed migration record so they can pass through validate/simulate/execute.
ALTER TABLE "Migration" ADD COLUMN "sourcePayload" JSONB;
