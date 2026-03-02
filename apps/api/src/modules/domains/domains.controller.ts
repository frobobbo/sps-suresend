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
  UseGuards,
} from '@nestjs/common';
import { DomainsService } from './domains.service';
import { CreateDomainDto, DelegateAccessDto } from './domains.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('domains')
@UseGuards(JwtAuthGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.domainsService.findAllForUser(user);
  }

  @Post()
  create(@Body() dto: CreateDomainDto, @CurrentUser() user: any) {
    return this.domainsService.create(dto, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.domainsService.findOne(id, user);
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
}
