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
  Put,
  UseGuards,
} from '@nestjs/common';
import { DomainsService } from './domains.service';
import { CreateDomainDto, DelegateAccessDto, SetCloudflareTokenDto } from './domains.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Domain } from './domain.entity';

// Strip cloudflareToken from any response shape.
function safeDto(domain: Domain) {
  const { cloudflareToken: _, ...rest } = domain as any;
  return rest as Omit<typeof domain, 'cloudflareToken'>;
}

@Controller('domains')
@UseGuards(JwtAuthGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get()
  async findAll(@CurrentUser() user: any) {
    const domains = await this.domainsService.findAllForUser(user);
    return domains.map((d) => safeDto(d));
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
  setCloudflareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCloudflareTokenDto,
    @CurrentUser() user: any,
  ) {
    return this.domainsService.setCloudflareToken(id, dto.token, user);
  }

  @Delete(':id/cloudflare')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCloudflareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.domainsService.removeCloudflareToken(id, user);
  }

  @Post(':id/fix/:check')
  applyFix(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('check') check: string,
    @Body() payload: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.domainsService.applyFix(id, check, user, payload);
  }
}
