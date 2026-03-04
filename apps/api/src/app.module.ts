import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DomainsModule } from './modules/domains/domains.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { HealthModule } from './modules/health/health.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { SeedModule } from './seed/seed.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    DomainsModule,
    ReputationModule,
    HealthModule,
    SubscriptionsModule,
    WorkspacesModule,
    SeedModule,
    SettingsModule,
  ],
})
export class AppModule {}
