import { Controller, Get } from '@nestjs/common';
import { healthStatusSchema } from '@suresend/shared';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return healthStatusSchema.parse({
      status: 'ok',
      service: 'strategyplus-suresend-api',
      timestamp: new Date().toISOString(),
    });
  }
}
