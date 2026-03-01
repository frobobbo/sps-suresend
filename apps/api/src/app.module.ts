import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule, SubscriptionsModule, WorkspacesModule],
})
export class AppModule {}
