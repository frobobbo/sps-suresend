import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UsersService } from '../modules/users/users.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly usersService: UsersService) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.log(
        'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping default admin seed',
      );
      return;
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      this.logger.log(`Admin user ${email} already exists — skipping seed`);
      return;
    }

    await this.usersService.create({ email, password, role: 'admin' });
    this.logger.log(`Default admin user created: ${email}`);
  }
}
