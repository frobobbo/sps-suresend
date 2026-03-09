import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_OPTIONS,
  type RateLimitOptions,
} from './rate-limit.decorator';

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_OPTIONS,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    const req = context.switchToHttp().getRequest();
    const identity = String(
      req.user?.id ??
        req.body?.email ??
        req.headers['x-forwarded-for'] ??
        req.ip ??
        'anonymous',
    );
    const now = Date.now();
    const key = `${options.keyPrefix}:${identity}`;
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      this.prune(now);
      return true;
    }

    if (current.count >= options.limit) {
      throw new HttpException(
        'Too many requests, please try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    return true;
  }

  private prune(now: number): void {
    if (this.buckets.size < 5000) return;
    for (const [key, value] of this.buckets.entries()) {
      if (value.resetAt <= now) this.buckets.delete(key);
    }
  }
}
