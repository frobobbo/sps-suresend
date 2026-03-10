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
  private static readonly JOB_TIMEOUT_MS = 90_000; // 90 seconds hard limit per job
  private readonly logger = new Logger(ScanQueueService.name);
  private workerTimer?: NodeJS.Timeout;
  private schedulerTimer?: NodeJS.Timeout;
  private recoveryTimer?: NodeJS.Timeout;
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

  async onModuleInit(): Promise<void> {
    // Recover any jobs left in 'running' state from a previous process crash/restart
    const recovered = await this.jobRepo.update(
      { status: 'running' },
      { status: 'failed', finishedAt: new Date(), error: 'Scan interrupted (process restart)' },
    );
    if (recovered.affected && recovered.affected > 0) {
      this.logger.warn(`Recovered ${recovered.affected} stuck running scan job(s) from previous process`);
    }

    if (!this.backgroundJobsEnabled()) {
      this.logger.log(`Background scan queue disabled for process role "${this.processRole}"`);
      return;
    }

    this.workerTimer = setInterval(() => void this.processDueJobs(), 5000);
    this.schedulerTimer = setInterval(() => void this.enqueueScheduledScans(), 60000);
    // Periodically recover jobs orphaned by a pod restart that raced with job creation
    this.recoveryTimer = setInterval(() => void this.recoverStuckJobs(), 120_000);
    void this.processDueJobs();
    void this.enqueueScheduledScans();
    this.logger.log(`Background scan queue enabled for process role "${this.processRole}"`);
  }

  onModuleDestroy(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
  }

  async kickManualQueue(): Promise<void> {
    // Only kick when this process runs the worker role.
    // On API-only pods the worker will pick up the job within its polling interval.
    // If we let the API pod process here it holds the advisory lock for the full
    // scan duration (~10-90s), blocking the dedicated worker from running anything.
    if (this.backgroundJobsEnabled()) {
      await this.processDueJobs();
    }
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
          if (!this.isActiveJobConflict(error)) {
            this.logger.error(`Failed to enqueue scheduled scan for domain ${domain.id}: ${String(error)}`);
          }
        }
      }
    });
  }

  private async recoverStuckJobs(): Promise<void> {
    // Fail any job that has been 'running' longer than twice the hard timeout.
    // This handles the rolling-deployment race where a pod is killed mid-scan and
    // onModuleInit recovery never saw the job (it was created after the new pod started).
    const cutoff = new Date(Date.now() - ScanQueueService.JOB_TIMEOUT_MS * 2);
    const result = await this.jobRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'failed', finishedAt: new Date(), error: 'Scan interrupted (orphaned by pod restart)' })
      .where('"status" = :status AND "startedAt" < :cutoff', { status: 'running', cutoff })
      .execute();
    if (result.affected && result.affected > 0) {
      this.logger.warn(`Periodic recovery: failed ${result.affected} orphaned running job(s)`);
    }
  }

  private async processDueJobs(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.withAdvisoryLock(ScanQueueService.WORKER_LOCK_ID, async () => {
        while (true) {
          const jobId = await this.claimNextJobId();
          this.logger.debug(`claimNextJobId → ${jobId ?? 'none'}`);
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
    // The timeout covers the ENTIRE job execution, not just runCheck.
    // Without this, any hanging DB operation before runCheck would leave the job stuck forever.
    try {
      await Promise.race([
        this.executeJob(jobId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Scan timed out')), ScanQueueService.JOB_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      await this.failJob(jobId, error instanceof Error ? error.message : 'Unknown scan failure');
    }
  }

  private async executeJob(jobId: string): Promise<void> {
    this.logger.log(`[job:${jobId}] fetching job record`);
    const job = await this.jobRepo.findOneByOrFail({ id: jobId });

    this.logger.log(`[job:${jobId}] fetching domain ${job.domainId}`);
    const domain = await this.domainRepo.findOne({
      where: { id: job.domainId },
      relations: ['owner'],
    });
    if (!domain) throw new Error('Domain not found');
    if (!domain.verifiedAt) throw new Error('Domain ownership has not been verified');

    this.logger.log(`[job:${jobId}] fetching previous check`);
    const previous = await this.checkRepo.findOne({
      where: { domainId: domain.id },
      order: { checkedAt: 'DESC' },
    });

    this.logger.log(`[job:${jobId}] running reputation check for ${domain.name}`);
    const check = await this.reputationService.runCheck(domain.id, domain.name);

    this.logger.log(`[job:${jobId}] marking completed`);
    await this.jobRepo.update(
      { id: jobId },
      { status: 'completed', finishedAt: new Date(), resultCheckId: check.id },
    );

    if (job.trigger === 'scheduled' && domain.alertsEnabled) {
      await this.maybeSendScheduledAlert(domain.owner, domain, check, previous);
    }
    this.logger.log(`[job:${jobId}] done`);
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
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      const rows = await qr.query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
      if (!rows[0]?.locked) {
        this.logger.debug(`Advisory lock ${lockId} not acquired (held by another process)`);
        return;
      }
      try {
        await fn();
      } finally {
        await qr.query('SELECT pg_advisory_unlock($1)', [lockId]);
      }
    } finally {
      await qr.release();
    }
  }

  private isActiveJobConflict(error: unknown): boolean {
    return error instanceof QueryFailedError
      && typeof error.driverError?.constraint === 'string'
      && error.driverError.constraint === 'UQ_scan_jobs_active_domain';
  }
}
