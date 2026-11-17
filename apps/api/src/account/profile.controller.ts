import { Controller, Delete, Get, HttpCode, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import { SessionService } from '../auth/session.service.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import type { BrowserRequest, CookieReply } from '../auth/csrf.guard.js';
interface Input<T = unknown> extends BrowserRequest { contractInput: { body: T }; contractCredential?: Credential }
function credential(request: Input) {
  if (request.contractCredential?.kind !== 'session') throw new ValidationError('SESSION_REQUIRED');
  return request.contractCredential;
}
@Controller()
export class ProfileController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService, @Inject(CsrfGuard) private readonly csrf: CsrfGuard) {}
  @Get('auth/csrf') @ContractRoute('csrf')
  csrfToken(@Req() request: Input, @Res({ passthrough: true }) response: CookieReply) { return this.csrf.bootstrap(request, response); }
  @Post('sessions') @HttpCode(200) @ContractRoute('login')
  async login(@Req() request: Input<HttpDto<'Login'>>, @Res({ passthrough: true }) response: CookieReply) {
    const result = await this.sessions.login(request.contractInput.body);
    if (request.contractInput.body.clientType === 'desktop') response.setHeader('Authorization', result.credential);
    else this.csrf.login(response, result.credential, result.view.expiresAt);
    return result.view;
  }
  @Delete('sessions/current') @HttpCode(200) @ContractRoute('logout')
  async logout(@Req() request: Input<HttpDto<'Operation'>>, @Res({ passthrough: true }) response: CookieReply) {
    const result = await this.sessions.logout(credential(request), request.contractInput.body);
    this.csrf.clear(request, response); return result;
  }
  @Post('sessions/revoke-all') @HttpCode(200) @ContractRoute('revokeAll')
  async revokeAll(@Req() request: Input<HttpDto<'RevokeAll'>>, @Res({ passthrough: true }) response: CookieReply) {
    const result = await this.sessions.revokeAll(credential(request), request.contractInput.body);
    this.csrf.clear(request, response); return result;
  }
  @Get('account/profile') @ContractRoute('profile')
  profile(@Req() request: Input) { return this.sessions.profile(credential(request)); }
  @Patch('account/profile') @ContractRoute('updateProfile')
  update(@Req() request: Input<HttpDto<'UpdateProfile'>>) { return this.sessions.updateProfile(credential(request), request.contractInput.body); }
  @Post('account/password') @HttpCode(200) @ContractRoute('password')
  password(@Req() request: Input<HttpDto<'ChangePassword'>>) { return this.sessions.changePassword(credential(request), request.contractInput.body); }
}
