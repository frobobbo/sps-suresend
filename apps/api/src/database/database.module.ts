import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../modules/users/user.entity';
import { Domain } from '../modules/domains/domain.entity';
import { DomainAccess } from '../modules/domains/domain-access.entity';
import { ReputationCheck } from '../modules/reputation/reputation-check.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [User, Domain, DomainAccess, ReputationCheck],
        // TODO: replace with migrations before production
        synchronize: true,
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
