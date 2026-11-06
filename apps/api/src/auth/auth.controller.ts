import {
  changePinSchema,
  loginSchema,
  verifyPinSchema,
  type AuthSessionResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser, Public, type RequestUserContext } from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: unknown): Promise<AuthSessionResponse> {
    const input = parseWithZod(loginSchema, body);
    return this.authService.login(input);
  }

  @Get('me')
  me(@CurrentUser() auth: RequestUserContext): Promise<Omit<AuthSessionResponse, 'accessToken'>> {
    return this.authService.getSession(auth);
  }

  @Post('verify-pin')
  @HttpCode(HttpStatus.OK)
  verifyPin(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<{ verified: true }> {
    const input = parseWithZod(verifyPinSchema, body);
    return this.authService.verifyCurrentUserPin(auth.user.id, input);
  }

  @Post('change-pin')
  @HttpCode(HttpStatus.OK)
  changePin(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<{ updated: true }> {
    const input = parseWithZod(changePinSchema, body);
    return this.authService.changePin(auth.user.id, auth.user.organizationId, input);
  }
}
