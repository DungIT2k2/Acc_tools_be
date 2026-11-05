import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthCredentialsDto, LoginResponseDto } from './auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Đăng nhập hệ thống
   *
   * @remarks Trả về access_token (JWT, hạn 1 ngày) dùng cho header Authorization của các API cần xác thực.
   * @throws {404} Tài khoản không tồn tại hoặc sai mật khẩu.
   */
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() body: AuthCredentialsDto): object {
    return this.authService.login(body);
  }

  /**
   * Đăng ký tài khoản
   *
   * @throws {400} Tài khoản đã tồn tại.
   */
  @Post('register')
  @HttpCode(200)
  register(@Body() body: AuthCredentialsDto): object {
    return this.authService.register(body);
  }
}
