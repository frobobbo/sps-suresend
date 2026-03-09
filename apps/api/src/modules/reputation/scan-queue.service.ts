import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ScanJob } from './scan-job.entity';
import { ReputationService } from './reputation.service';
import { DomainsService } from '../domains/domains.service';
import { Domain } from '../domains/domain.entity';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { ReputationCheck } from './reputation-check.entity';

@Injectable()
export class ScanQueueService implements OnModuleInit, OnModuleDestroy {
  private static readonly WORKER_LOCK_ID = 7_310_001;
  private static readonly SCHEDULER_LOCK_ID = 7_310_002;
  private readonly logger = new Logger(ScanQueueService.name);
  private workerTimer?: NodeJS.Timeout;
  private schedulerTimer?: NodeJS.Timeout;
  private processing = false;
  private readonly processRole = (process.env.SURESEND_PROCESS_ROLE ?? 'all').toLowerCase();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ScanJob)
    private readonly jobRepo: Repository<ScanJob>,
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectRepository(ReputationCheck)
    private readonly checkRepo: Repository<ReputationCheck>,
    private readonly reputationService: ReputationService,
    private readonly domainsService: DomainsService,
    private readonly mailService: MailService,
  ) {}

  onModuleInit(): void {
    if (!this.backgroundJobsEnabled()) {
      this.logger.log(`Background scan queue disabled for process role "${this.processRole}"`);
      return;
    }

    this.workerTimer = setInterval(() => void this.processDueJobs(), 5000);
    this.schedulerTimer = setInterval(() => void this.enqueueScheduledScans(), 60000);
    void this.processDueJobs();
    void this.enqueueScheduledScans();
    this.logger.log(`Background scan queue enabled for process role "${this.processRole}"`);
  }

  onModuleDestroy(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
  }

  async kickManualQueue(): Promise<void> {
    await this.processDueJobs();
  }

  async enqueueManual(domainId: string, requestedByUserId: string): Promise<ScanJob> {
    const existing = await this.jobRepo.findOne({
      where: [
        { domainId, status: 'queued' },
        { domainId, status: 'running' },
      ],
      order: { createdAt: 'DESC' },
    });
    if (existing) return existing;

    try {
      const job = this.jobRepo.create({
        domainId,
        status: 'queued',
        trigger: 'manual',
        requestedByUserId,
        runAt: new Date(),
        startedAt: null,
        finishedAt: null,
        resultCheckId: null,
        error: null,
      });
      return await this.jobRepo.save(job);
    } catch (error) {
      if (this.isActiveJobConflict(error)) {
        const active = await this.jobRepo.findOne({
          where: [
            { domainId, status: 'queued' },
            { domainId, status: 'running' },
          ],
          order: { createdAt: 'DESC' },
        });
        if (active) return active;
      }
      throw error;
    }
  }

  latestForDomain(domainId: string): Promise<ScanJob | null> {
    return this.jobRepo.findOne({
      where: { domainId },
      order: { createdAt: 'DESC' },
    });
  }

  private async enqueueScheduledScans(): Promise<void> {
    await this.withAdvisoryLock(ScanQueueService.SCHEDULER_LOCK_ID, async () => {
      const now = new Date();
      const domains = await this.domainsService.findVerifiedDomainsDue(now);
      for (const domain of domains) {
        const intervalMinutes = domain.scanIntervalMinutes;
        if (!intervalMinutes) continue;
        const last = domain.lastScheduledScanAt?.getTime() ?? 0;
        if (last && now.getTime() - last < intervalMinutes * 60 * 1000) continue;

        try {
          await this.jobRepo.save(this.jobRepo.create({
            domainId: domain.id,
            status: 'queued',
            trigger: 'scheduled',
            requestedByUserId: null,
            runAt: now,
            startedAt: null,
            finishedAt: null,
            resultCheckId: null,
            error: null,
          }));
          await this.domainsService.markScheduledScanQueued(domain.id, now);
        } catch (error) {
          if (!this.isActiveJobConflict(error)) throw error;
        }
      }
    });
  }

  private async processDueJobs(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.withAdvisoryLock(ScanQueueService.WORKER_LOCK_ID, async () => {
        while (true) {
          const jobId = await this.claimNextJobId();
          if (!jobId) break;
          await this.runJob(jobId);
        }
      });
    } finally {
      this.processing = false;
    }
  }

  private async claimNextJobId(): Promise<string | null> {
    const rows = await this.dataSource.query(`
      UPDATE "scan_jobs"
      SET
        "status" = 'running',
        "startedAt" = NOW(),
        "error" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = (
        SELECT "id"
        FROM "scan_jobs"
        WHERE "status" = 'queued'
          AND "runAt" <= NOW()
        ORDER BY "runAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING "id"
    `);
    return rows[0]?.id ?? null;
  }

  private async runJob(jobId: string): Promise<void> {
    const job = await this.jobRepo.findOneByOrFail({ id: jobId });
    const domain = await this.domainRepo.findOne({
      where: { id: job.domainId },
      relations: ['owner'],
    });
    if (!domain) {
      await this.failJob(jobId, 'Domain not found');
      return;
    }
    if (!domain.verifiedAt) {
      await this.failJob(jobId, 'Domain ownership has not been verified');
      return;
    }

    const previous = await this.checkRepo.findOne({
      where: { domainId: domain.id },
      order: { checkedAt: 'DESC' },
    });

    try {
      const check = await this.reputationService.runCheck(domain.id, domain.name);
      await this.jobRepo.update(
        { id: jobId },
        {
          status: 'completed',
          finishedAt: new Date(),
          resultCheckId: check.id,
        },
      );

      if (job.trigger === 'scheduled' && domain.alertsEnabled) {
        await this.maybeSendScheduledAlert(domain.owner, domain, check, previous);
      }
    } catch (error) {
      await this.failJob(jobId, error instanceof Error ? error.message : 'Unknown scan failure');
    }
  }

  private async maybeSendScheduledAlert(
    owner: User,
    domain: Domain,
    current: ReputationCheck,
    previous: ReputationCheck | null,
  ): Promise<void> {
    const shouldSend =
      !previous
        ? current.status !== 'clean'
        : previous.status !== current.status;

    if (!shouldSend) return;

    await this.mailService.sendReputationReport(owner.email, {
      domainName: domain.name,
      score: current.score,
      emailScore: current.emailScore,
      webScore: current.webScore,
      status: current.status,
      checkedAt: current.checkedAt,
      details: current.details as Record<string, unknown>,
    });
  }

  private async failJob(jobId: string, error: string): Promise<void> {
    this.logger.warn(`Scan job ${jobId} failed: ${error}`);
    await this.jobRepo.update(
      { id: jobId },
      {
        status: 'failed',
        finishedAt: new Date(),
        error,
      },
    );
  }

  private backgroundJobsEnabled(): boolean {
    return this.processRole === 'all' || this.processRole === 'worker';
  }

  private async withAdvisoryLock(lockId: number, fn: () => Promise<void>): Promise<void> {
    const rows = await this.dataSource.query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
    if (!rows[0]?.locked) return;

    try {
      await fn();
    } finally {
      await this.dataSource.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  }

  private isActiveJobConflict(error: unknown): boolean {
    return error instanceof QueryFailedError
      && typeof error.driverError?.constraint === 'string'
      && error.driverError.constraint === 'UQ_scan_jobs_active_domain';
  }
}
