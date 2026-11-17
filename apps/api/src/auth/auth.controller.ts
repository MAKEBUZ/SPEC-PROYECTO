import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import { TokensService } from './tokens.service.js';

interface Input<T> { contractInput: { body: T }; contractCredential?: Credential }
@Controller()
export class AuthController {
  constructor(@Inject(TokensService) private readonly tokens: TokensService) {}
  @Post('accounts') @HttpCode(201) @ContractRoute('register')
  register(@Req() request: Input<HttpDto<'Register'>>) { return this.tokens.register(request.contractInput.body); }
  @Post('email-verification/request') @HttpCode(200) @ContractRoute('verificationRequest')
  resend(@Req() request: Input<HttpDto<'Operation'>>) {
    const credential = request.contractCredential;
    if (credential?.kind !== 'session' || !credential.sessionId) throw new ValidationError('SESSION_REQUIRED');
    return this.tokens.resend(request.contractInput.body, credential.accountId, credential.sessionId);
  }
  @Post('email-verification/confirm') @HttpCode(200) @ContractRoute('verificationConfirm')
  verify(@Req() request: Input<HttpDto<'VerifyEmail'>>) { return this.tokens.confirmVerification(request.contractInput.body); }
  @Post('password-reset/request') @HttpCode(202) @ContractRoute('resetRequest')
  resetRequest(@Req() request: Input<HttpDto<'ResetRequest'>>) { return this.tokens.requestReset(request.contractInput.body); }
  @Post('password-reset/confirm') @HttpCode(200) @ContractRoute('resetConfirm')
  resetConfirm(@Req() request: Input<HttpDto<'ResetConfirm'>>) { return this.tokens.confirmReset(request.contractInput.body); }
}
