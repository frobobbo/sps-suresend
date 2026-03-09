import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710000000000 implements MigrationInterface {
  name = 'InitialSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "role" character varying NOT NULL DEFAULT 'user',
        "tier" character varying NOT NULL DEFAULT 'free',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "domains" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "ownerId" uuid NOT NULL,
        "cloudflareToken" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_domains_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_domains_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "domain_access" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "domainId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_domain_access_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_domain_access_domain_user" UNIQUE ("domainId", "userId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reputation_checks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "domainId" uuid NOT NULL,
        "score" integer NOT NULL,
        "emailScore" integer NOT NULL DEFAULT 0,
        "webScore" integer NOT NULL DEFAULT 0,
        "status" character varying NOT NULL,
        "details" jsonb NOT NULL,
        "checkedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reputation_checks_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key" character varying(100) NOT NULL,
        "value" text,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_settings_key" PRIMARY KEY ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "action" character varying(100) NOT NULL,
        "actorId" character varying(36),
        "actorEmail" character varying(320),
        "resourceType" character varying(100),
        "resourceId" character varying(100),
        "status" character varying(32) NOT NULL,
        "ip" character varying(64),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_domains_owner'
        ) THEN
          ALTER TABLE "domains"
          ADD CONSTRAINT "FK_domains_owner"
          FOREIGN KEY ("ownerId") REFERENCES "users"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_domain_access_domain'
        ) THEN
          ALTER TABLE "domain_access"
          ADD CONSTRAINT "FK_domain_access_domain"
          FOREIGN KEY ("domainId") REFERENCES "domains"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_domain_access_user'
        ) THEN
          ALTER TABLE "domain_access"
          ADD CONSTRAINT "FK_domain_access_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_reputation_checks_domain'
        ) THEN
          ALTER TABLE "reputation_checks"
          ADD CONSTRAINT "FK_reputation_checks_domain"
          FOREIGN KEY ("domainId") REFERENCES "domains"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_domains_ownerId" ON "domains" ("ownerId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_domain_access_userId" ON "domain_access" ("userId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_reputation_checks_domainId" ON "reputation_checks" ("domainId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_createdAt" ON "audit_logs" ("action", "createdAt")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_audit_logs_action_createdAt"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_reputation_checks_domainId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_domain_access_userId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_domains_ownerId"');
    await queryRunner.query('ALTER TABLE "reputation_checks" DROP CONSTRAINT IF EXISTS "FK_reputation_checks_domain"');
    await queryRunner.query('ALTER TABLE "domain_access" DROP CONSTRAINT IF EXISTS "FK_domain_access_user"');
    await queryRunner.query('ALTER TABLE "domain_access" DROP CONSTRAINT IF EXISTS "FK_domain_access_domain"');
    await queryRunner.query('ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "FK_domains_owner"');
    await queryRunner.query('DROP TABLE IF EXISTS "audit_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "app_settings"');
    await queryRunner.query('DROP TABLE IF EXISTS "reputation_checks"');
    await queryRunner.query('DROP TABLE IF EXISTS "domain_access"');
    await queryRunner.query('DROP TABLE IF EXISTS "domains"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
