-- Add saved workflow definitions and associate them with a project.
ALTER TABLE "Workflow"
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "steps" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Workflow_projectId_createdAt_idx"
  ON "Workflow"("projectId", "createdAt");

ALTER TABLE "Workflow"
  ADD CONSTRAINT "Workflow_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
