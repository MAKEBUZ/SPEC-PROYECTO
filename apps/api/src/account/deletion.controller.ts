import { Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import type { BrowserRequest, CookieReply } from '../auth/csrf.guard.js';
import { CsrfGuard, readCookie, SESSION_COOKIE } from '../auth/csrf.guard.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { DeletionService } from './deletion.service.js';
import { DELETION_COOKIE } from './deletion-check.service.js';
interface Input<T = unknown> extends BrowserRequest { contractInput: { body: T; query: HttpDto<'ScopeQuery'> }; contractCredential?: Credential }
function session(request: Input) { if (request.contractCredential?.kind !== 'session') throw new ValidationError('SESSION_REQUIRED'); return request.contractCredential; }
@Controller()
export class DeletionController {
  constructor(@Inject(DeletionService) private readonly deletion: DeletionService, @Inject(CsrfGuard) private readonly csrf: CsrfGuard) {}
  private deliver(request: Input, response: CookieReply, requestId: string, capability?: string) {
    if (!capability) return;
    if (readCookie(request, SESSION_COOKIE)) response.setHeader('Set-Cookie', `${DELETION_COOKIE}=${capability.slice(7)}; Path=/v1/deletion-status/${requestId}; Secure; HttpOnly; SameSite=Strict`);
    else response.setHeader('X-Deletion-Credential', capability);
  }
  @Post('account/deletion') @HttpCode(200) @ContractRoute('deleteAccount')
  async remove(@Req() request: Input<HttpDto<'DeleteAccount'>>, @Res({ passthrough: true }) response: CookieReply) {
    const reply = await this.deletion.delete(session(request), request.contractInput.body);
    this.deliver(request, response, (reply.result.data as { requestId: string }).requestId, reply.capability);
    return reply.result;
  }
  @Get('account/deletion') @ContractRoute('deletion')
  info(@Req() request: Input) { return this.deletion.info(session(request)); }
  @Post('account/recovery') @HttpCode(200) @ContractRoute('recoverAccount')
  async recover(@Req() request: Input<HttpDto<'RecoverAccount'>>, @Res({ passthrough: true }) response: CookieReply) {
    const result = await this.deletion.recover(session(request), request.contractInput.body);
    this.csrf.clear(request, response); return result;
  }
  @Post('account/deletion/credentials') @HttpCode(200) @ContractRoute('deletionCredential')
  async issue(@Req() request: Input<HttpDto<'Operation'>>, @Res({ passthrough: true }) response: CookieReply) {
    const reply = await this.deletion.issue(session(request), request.contractInput.body);
    this.deliver(request, response, (reply.result.data as { requestId: string }).requestId, reply.capability); return reply.result;
  }
  @Get('deletion-status/:requestId') @ContractRoute('deletionStatus')
  status(@Req() request: Input, @Param('requestId') requestId: string) {
    if (request.contractCredential?.kind !== 'deletion') throw new ValidationError('ACCESS_DENIED');
    return this.deletion.checks.status(request.contractCredential, requestId);
  }
}
