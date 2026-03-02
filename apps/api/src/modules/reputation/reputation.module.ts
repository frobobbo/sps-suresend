import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReputationCheck } from './reputation-check.entity';
import { ReputationService } from './reputation.service';
import { ReputationController } from './reputation.controller';
import { DomainsModule } from '../domains/domains.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReputationCheck]), DomainsModule],
  providers: [ReputationService],
  controllers: [ReputationController],
})
export class ReputationModule {}
