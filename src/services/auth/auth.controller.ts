import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body): object {
    return this.authService.login(body);
  }

  @Post('register')
  @HttpCode(200)
  register(@Body() body): object {
    return this.authService.register(body);
  }
}
