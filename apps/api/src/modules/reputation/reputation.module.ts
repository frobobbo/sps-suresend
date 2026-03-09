import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Domain } from '../domains/domain.entity';
import { ReputationCheck } from './reputation-check.entity';
import { ScanJob } from './scan-job.entity';
import { ReputationService } from './reputation.service';
import { ReputationController } from './reputation.controller';
import { DomainsModule } from '../domains/domains.module';
import { MailModule } from '../mail/mail.module';
import { ScanQueueService } from './scan-queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReputationCheck, ScanJob, Domain]), DomainsModule, MailModule],
  providers: [ReputationService, ScanQueueService],
  controllers: [ReputationController],
})
export class ReputationModule {}
