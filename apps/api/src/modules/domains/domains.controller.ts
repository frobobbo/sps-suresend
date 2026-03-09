import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainsService } from './domains.service';
import { CreateDomainDto, DelegateAccessDto, SetCloudflareTokenDto, UpdateMonitoringDto } from './domains.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Domain } from './domain.entity';
import { AuditService } from '../audit/audit.service';
import { RateLimit } from '../security/rate-limit.decorator';
import { RateLimitGuard } from '../security/rate-limit.guard';

// Strip cloudflareToken from any response shape.
function safeDto(domain: Domain) {
  const { cloudflareToken: _, ...rest } = domain as any;
  return rest as Omit<typeof domain, 'cloudflareToken'>;
}

@Controller('domains')
@UseGuards(JwtAuthGuard)
export class DomainsController {
  constructor(
    private readonly domainsService: DomainsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: any) {
    const domains = await this.domainsService.findAllForUser(user);
    const cfIds = await this.domainsService.getCfConnectedIds(domains.map((d) => d.id));
    return domains.map((d) => ({ ...safeDto(d), cloudflareConnected: cfIds.has(d.id) }));
  }

  @Post()
  async create(@Body() dto: CreateDomainDto, @CurrentUser() user: any) {
    return safeDto(await this.domainsService.create(dto, user));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    const domain = await this.domainsService.findOne(id, user);
    const cloudflareConnected = await this.domainsService.hasCloudflareToken(id);
    return { ...safeDto(domain), cloudflareConnected };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.domainsService.remove(id, user);
  }

  @Get(':id/verification')
  verification(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.domainsService.getVerificationDetails(id, user);
  }

  @Post(':id/verify')
  verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.domainsService.verifyOwnership(id, user);
  }

  @Put(':id/monitoring')
  updateMonitoring(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMonitoringDto,
    @CurrentUser() user: any,
  ) {
    return this.domainsService.updateMonitoringSettings(id, dto, user);
  }

  @Post(':id/access')
  delegateAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DelegateAccessDto,
    @CurrentUser() user: any,
  ) {
    return this.domainsService.delegateAccess(id, dto, user);
  }

  @Delete(':id/access/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: any,
  ) {
    return this.domainsService.revokeAccess(id, userId, user);
  }

  // ── Cloudflare ─────────────────────────────────────────────────────────────

  @Put(':id/cloudflare')
  @UseGuards(RateLimitGuard)
  @RateLimit({ keyPrefix: 'cloudflare-connect', limit: 10, windowMs: 60 * 60 * 1000 })
  setCloudflareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCloudflareTokenDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.auditWrap(
      () => this.domainsService.setCloudflareToken(id, dto.token, user),
      {
        action: 'cloudflare.connect',
        actorId: user.id,
        actorEmail: user.email,
        resourceType: 'domain',
        resourceId: id,
        ip: req.ip,
      },
    );
  }

  @Delete(':id/cloudflare')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  @RateLimit({ keyPrefix: 'cloudflare-disconnect', limit: 10, windowMs: 60 * 60 * 1000 })
  removeCloudflareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.auditWrap(
      () => this.domainsService.removeCloudflareToken(id, user),
      {
        action: 'cloudflare.disconnect',
        actorId: user.id,
        actorEmail: user.email,
        resourceType: 'domain',
        resourceId: id,
        ip: req.ip,
      },
    );
  }

  @Post(':id/fix/:check')
  @UseGuards(RateLimitGuard)
  @RateLimit({ keyPrefix: 'cloudflare-fix', limit: 25, windowMs: 60 * 60 * 1000 })
  applyFix(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('check') check: string,
    @Body() payload: Record<string, unknown>,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.auditWrap(
      () => this.domainsService.applyFix(id, check, user, payload),
      {
        action: 'cloudflare.fix',
        actorId: user.id,
        actorEmail: user.email,
        resourceType: 'domain',
        resourceId: id,
        ip: req.ip,
        metadata: { check },
      },
    );
  }

  private async auditWrap<T>(
    fn: () => Promise<T>,
    input: {
      action: string;
      actorId: string;
      actorEmail?: string;
      resourceType: string;
      resourceId: string;
      ip?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<T> {
    try {
      const result = await fn();
      await this.auditService.record({ ...input, status: 'success' });
      return result;
    } catch (error) {
      await this.auditService.record({
        ...input,
        status: 'failure',
        metadata: {
          ...input.metadata,
          reason: error instanceof Error ? error.message : 'unknown',
        },
      });
      throw error;
    }
  }
}
