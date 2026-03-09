import { Global, Module } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { SecretCipherService } from './secret-cipher.service';

@Global()
@Module({
  providers: [RateLimitGuard, SecretCipherService],
  exports: [RateLimitGuard, SecretCipherService],
})
export class SecurityModule {}
