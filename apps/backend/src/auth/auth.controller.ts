import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { ChangePasswordDto, LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.organizationSlug, body.email, body.password);
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(@Body() body: ChangePasswordDto, @Req() request: AuthenticatedRequest) {
    await this.auth.changePassword(request.user.id, body.currentPassword, body.newPassword);
    return { message: 'Password changed successfully' };
  }
}
