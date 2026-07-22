import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { CurrentUser, Public } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  AuthService,
  type AuthProfile,
  type TokenPair,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthProfile> {
    return this.authService.getProfile(user);
  }
}
