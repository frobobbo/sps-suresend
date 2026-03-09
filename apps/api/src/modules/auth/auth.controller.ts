import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { RateLimit } from '../security/rate-limit.decorator';
import { RateLimitGuard } from '../security/rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ keyPrefix: 'auth-register', limit: 5, windowMs: 15 * 60 * 1000 })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    try {
      const user = await this.authService.register(dto);
      await this.auditService.record({
        action: 'auth.register',
        actorId: user.id,
        actorEmail: user.email,
        status: 'success',
        ip: req.ip,
      });
      const { password: _, ...safe } = user;
      return safe;
    } catch (error) {
      await this.auditService.record({
        action: 'auth.register',
        actorEmail: dto.email,
        status: 'failure',
        ip: req.ip,
        metadata: { reason: error instanceof Error ? error.message : 'unknown' },
      });
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ keyPrefix: 'auth-login', limit: 10, windowMs: 15 * 60 * 1000 })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    try {
      const user = await this.authService.validateUser(dto.email, dto.password);
      await this.auditService.record({
        action: 'auth.login',
        actorId: user.id,
        actorEmail: user.email,
        status: 'success',
        ip: req.ip,
      });
      return this.authService.login(user);
    } catch (error) {
      await this.auditService.record({
        action: 'auth.login',
        actorEmail: dto.email,
        status: 'failure',
        ip: req.ip,
        metadata: { reason: error instanceof Error ? error.message : 'unknown' },
      });
      throw error;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }
}
