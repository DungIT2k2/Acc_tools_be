import { HttpCode, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { loginReq } from 'src/requests';
import { users } from './auth.data';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) { };
  login(body: loginReq): object {
    const username = body.username;
    const password = body.password;
    const userPassword = users[username];

    if (!userPassword) throw new HttpException('Tài khoản không tồn tại', HttpStatus.NOT_FOUND);
    if (password != userPassword) throw new HttpException('Sai mật khẩu', HttpStatus.NOT_FOUND);

    const access_token = this.jwtService.sign({ username }, {
      expiresIn: "1d"
    });
    return { access_token };
  }
}
