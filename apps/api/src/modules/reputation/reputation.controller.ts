import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReputationService } from './reputation.service';
import { DomainsService } from '../domains/domains.service';
import { MailService } from '../mail/mail.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('domains/:domainId/reputation')
@UseGuards(JwtAuthGuard)
export class ReputationController {
  constructor(
    private readonly reputationService: ReputationService,
    private readonly domainsService: DomainsService,
    private readonly mailService: MailService,
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
  async runCheck(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @CurrentUser() user: { id: string; email: string; role: 'admin' | 'user'; tier: 'free' | 'plus' | 'pro' },
  ) {
    const domain = await this.domainsService.findOne(domainId, user); // access check
    const check = await this.reputationService.runCheck(domainId, domain.name);

    // Send email report — fire and forget, never throw
    void this.mailService.sendReputationReport(user.email, {
      domainName: domain.name,
      score: check.score,
      emailScore: check.emailScore,
      webScore: check.webScore,
      status: check.status,
      checkedAt: check.checkedAt,
      details: check.details as Record<string, unknown>,
    });

    return check;
  }
}
