import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ReputationService } from './reputation.service';
import { ScanQueueService } from './scan-queue.service';
import { DomainsService } from '../domains/domains.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { RateLimit } from '../security/rate-limit.decorator';
import { RateLimitGuard } from '../security/rate-limit.guard';

@Controller('domains/:domainId/reputation')
@UseGuards(JwtAuthGuard)
export class ReputationController {
  constructor(
    private readonly reputationService: ReputationService,
    private readonly scanQueueService: ScanQueueService,
    private readonly domainsService: DomainsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async findAll(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @CurrentUser() user: any,
  ) {
    await this.domainsService.findOne(domainId, user); // access check
    return this.reputationService.findForDomain(domainId);
  }

  @Post('check')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @RateLimit({ keyPrefix: 'reputation-check', limit: 30, windowMs: 60 * 60 * 1000 })
  async runCheck(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @CurrentUser() user: { id: string; email: string; role: 'admin' | 'user'; tier: 'free' | 'plus' | 'pro' },
    @Req() req: Request,
  ) {
    try {
      const domain = await this.domainsService.findOne(domainId, user); // access check
      if (!domain.verifiedAt) {
        throw new BadRequestException('Verify this domain before running scans');
      }
      const job = await this.scanQueueService.enqueueManual(domainId, user.id);

      await this.auditService.record({
        action: 'reputation.check',
        actorId: user.id,
        actorEmail: user.email,
        resourceType: 'domain',
        resourceId: domainId,
        status: 'success',
        ip: req.ip,
        metadata: { queuedJobId: job.id },
      });
      return job;
    } catch (error) {
      await this.auditService.record({
        action: 'reputation.check',
        actorId: user.id,
        actorEmail: user.email,
        resourceType: 'domain',
        resourceId: domainId,
        status: 'failure',
        ip: req.ip,
        metadata: { reason: error instanceof Error ? error.message : 'unknown' },
      });
      throw error;
    }
  }

  @Get('jobs/latest')
  async latestJob(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @CurrentUser() user: any,
  ) {
    await this.domainsService.findOne(domainId, user);
    return this.scanQueueService.latestForDomain(domainId);
  }
}
