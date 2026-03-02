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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('domains/:domainId/reputation')
@UseGuards(JwtAuthGuard)
export class ReputationController {
  constructor(
    private readonly reputationService: ReputationService,
    private readonly domainsService: DomainsService,
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
    @CurrentUser() user: any,
  ) {
    const domain = await this.domainsService.findOne(domainId, user); // access check
    return this.reputationService.runCheck(domainId, domain.name);
  }
}
