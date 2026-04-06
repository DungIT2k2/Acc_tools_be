import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { loginReq } from 'src/requests';
import { RedisService } from '../redis/redis.service';
import crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}
  async login(body: loginReq): Promise<object> {
    const username = body.username;
    const password = body.password;
    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex')
      .toLowerCase();
    const userPassword = await this.redisService.hget('USER_AUTH', username);

    if (!userPassword)
      throw new HttpException('Tài khoản không tồn tại', HttpStatus.NOT_FOUND);
    if (passwordHash != userPassword)
      throw new HttpException('Sai mật khẩu', HttpStatus.NOT_FOUND);

    const access_token = this.signToken({ username });
    return { access_token };
  }

  async register(body: loginReq): Promise<object> {
    const username = body.username;
    const password = body.password;
    const user = await this.redisService.hget('USER_AUTH', username);
    if (user) {
      throw new HttpException('Tài khoản đã tồn tại', HttpStatus.BAD_REQUEST);
    }
    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex')
      .toLowerCase();
    await this.redisService.hset('USER_AUTH', username, passwordHash);
    return { message: 'Đăng ký thành công' };
  }

  signToken(payload: any): string {
    return this.jwtService.sign(payload, {
      expiresIn: '1d',
    });
  }
}
