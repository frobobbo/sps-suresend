import { Controller, Get } from '@nestjs/common';

@Controller('subscriptions')
export class SubscriptionsController {
  @Get('plans')
  getPlans() {
    return [
      {
        id: 'starter',
        name: 'Starter',
        monthlyPriceUsd: 49,
        features: ['DNS baseline checks', 'Single-domain monitoring', 'Weekly summary reports'],
      },
      {
        id: 'growth',
        name: 'Growth',
        monthlyPriceUsd: 129,
        features: ['SMTP diagnostics', 'Multi-domain monitoring', 'Priority remediation guidance'],
      },
      {
        id: 'pro',
        name: 'Pro',
        monthlyPriceUsd: 299,
        features: ['Reputation watchlist alerts', 'API access', 'White-label reports'],
      },
    ];
  }
}
