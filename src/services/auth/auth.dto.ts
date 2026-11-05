export class AuthCredentialsDto {
  /**
   * Tên đăng nhập
   * @example admin
   */
  username: string;

  /**
   * Mật khẩu
   * @example 123456
   */
  password: string;
}

export class LoginResponseDto {
  /** JWT dùng cho header Authorization: Bearer <token> */
  access_token: string;
}
