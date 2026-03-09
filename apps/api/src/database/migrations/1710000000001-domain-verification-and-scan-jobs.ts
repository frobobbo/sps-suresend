import { MigrationInterface, QueryRunner } from 'typeorm';

export class DomainVerificationAndScanJobs1710000000001 implements MigrationInterface {
  name = 'DomainVerificationAndScanJobs1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "domains"
      ADD COLUMN IF NOT EXISTS "verificationToken" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "domains"
      ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "domains"
      ADD COLUMN IF NOT EXISTS "scanIntervalMinutes" integer DEFAULT 1440
    `);
    await queryRunner.query(`
      ALTER TABLE "domains"
      ADD COLUMN IF NOT EXISTS "alertsEnabled" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "domains"
      ADD COLUMN IF NOT EXISTS "lastScheduledScanAt" TIMESTAMP
    `);
    await queryRunner.query(`
      UPDATE "domains"
      SET "verificationToken" = encode(gen_random_bytes(16), 'hex')
      WHERE "verificationToken" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "domains"
      ALTER COLUMN "verificationToken" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scan_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "domainId" uuid NOT NULL,
        "status" character varying(32) NOT NULL,
        "trigger" character varying(32) NOT NULL,
        "requestedByUserId" character varying(36),
        "runAt" TIMESTAMP NOT NULL,
        "startedAt" TIMESTAMP,
        "finishedAt" TIMESTAMP,
        "resultCheckId" character varying(36),
        "error" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_scan_jobs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_scan_jobs_domain'
        ) THEN
          ALTER TABLE "scan_jobs"
          ADD CONSTRAINT "FK_scan_jobs_domain"
          FOREIGN KEY ("domainId") REFERENCES "domains"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_domains_verifiedAt" ON "domains" ("verifiedAt")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_scan_jobs_status_runAt" ON "scan_jobs" ("status", "runAt")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_scan_jobs_domainId_createdAt" ON "scan_jobs" ("domainId", "createdAt")');
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_scan_jobs_active_domain"
      ON "scan_jobs" ("domainId")
      WHERE "status" IN ('queued', 'running')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_scan_jobs_active_domain"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_scan_jobs_domainId_createdAt"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_scan_jobs_status_runAt"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_domains_verifiedAt"');
    await queryRunner.query('ALTER TABLE "scan_jobs" DROP CONSTRAINT IF EXISTS "FK_scan_jobs_domain"');
    await queryRunner.query('DROP TABLE IF EXISTS "scan_jobs"');
    await queryRunner.query('ALTER TABLE "domains" DROP COLUMN IF EXISTS "lastScheduledScanAt"');
    await queryRunner.query('ALTER TABLE "domains" DROP COLUMN IF EXISTS "alertsEnabled"');
    await queryRunner.query('ALTER TABLE "domains" DROP COLUMN IF EXISTS "scanIntervalMinutes"');
    await queryRunner.query('ALTER TABLE "domains" DROP COLUMN IF EXISTS "verifiedAt"');
    await queryRunner.query('ALTER TABLE "domains" DROP COLUMN IF EXISTS "verificationToken"');
  }
}
