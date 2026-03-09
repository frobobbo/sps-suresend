import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

interface RecordAuditInput {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  status: 'success' | 'failure';
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.repo.save(this.repo.create({
        action: input.action,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        status: input.status,
        ip: input.ip ?? null,
        metadata: input.metadata ?? null,
      }));
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${String(error)}`);
    }
  }
}
