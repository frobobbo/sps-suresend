import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('email')
  async getEmailConfig() {
    const config = await this.settingsService.getEmailConfig();
    // Resolve effective values (DB overrides env vars)
    const apiKey = config.apiKey ?? process.env.MAILGUN_API_KEY ?? null;
    const domain = config.domain ?? process.env.MAILGUN_DOMAIN ?? null;
    const from = config.from ?? process.env.MAILGUN_FROM ?? null;
    return {
      apiKey: apiKey ? `***${apiKey.slice(-4)}` : null,
      domain,
      from,
      source: config.apiKey ? 'database' : (process.env.MAILGUN_API_KEY ? 'env' : 'none'),
      configured: !!(apiKey && domain),
    };
  }

  @Put('email')
  async setEmailConfig(
    @Body() body: { apiKey?: string; domain?: string; from?: string },
  ) {
    await this.settingsService.setEmailConfig(body);
    return { ok: true };
  }
}
