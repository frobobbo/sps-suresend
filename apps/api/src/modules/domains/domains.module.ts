import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Domain } from './domain.entity';
import { DomainAccess } from './domain-access.entity';
import { DomainsService } from './domains.service';
import { DomainsController } from './domains.controller';
import { CloudflareService } from './cloudflare.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Domain, DomainAccess]), UsersModule],
  providers: [DomainsService, CloudflareService],
  controllers: [DomainsController],
  exports: [DomainsService],
})
export class DomainsModule {}
