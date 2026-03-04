import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './app-setting.entity';

export interface EmailConfig {
  apiKey: string | null;
  domain: string | null;
  from: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOneBy({ key });
    return row?.value ?? null;
  }

  async set(key: string, value: string | null): Promise<void> {
    if (value === null || value === '') {
      await this.repo.delete({ key });
    } else {
      await this.repo.upsert({ key, value }, ['key']);
    }
  }

  async getEmailConfig(): Promise<EmailConfig> {
    const [apiKey, domain, from] = await Promise.all([
      this.get('mailgun_api_key'),
      this.get('mailgun_domain'),
      this.get('mailgun_from'),
    ]);
    return { apiKey, domain, from };
  }

  async setEmailConfig(fields: { apiKey?: string; domain?: string; from?: string }): Promise<void> {
    const ops: Promise<void>[] = [];
    if (fields.apiKey !== undefined) ops.push(this.set('mailgun_api_key', fields.apiKey));
    if (fields.domain !== undefined) ops.push(this.set('mailgun_domain', fields.domain));
    if (fields.from !== undefined) ops.push(this.set('mailgun_from', fields.from));
    await Promise.all(ops);
  }
}
