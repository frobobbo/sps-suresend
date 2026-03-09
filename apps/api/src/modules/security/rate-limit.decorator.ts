import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  keyPrefix: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_OPTIONS = 'rate_limit_options';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_OPTIONS, options);
