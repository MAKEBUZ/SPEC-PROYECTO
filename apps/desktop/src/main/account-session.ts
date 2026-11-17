import { randomUUID } from 'node:crypto';
import { DTO } from '../../../../packages/contracts/src/http-dto.js';
import {deletionCheckBatch} from '../../../../packages/contracts/src/deletion-check-batch.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { object, keys, uuid, array, ValidationError } from '../../../../packages/contracts/src/validation.js';
import { parseAccountAction } from '../../../../packages/contracts/src/account-actions.js';
import {isResourceQuery,resourceQuery} from '../../../../packages/contracts/src/resource-actions.js';
import {publicationRoute} from './publication/routes.js';

interface Active { credential: string; view: HttpDto<'SessionView'> }
interface Revocation { credential: string; operationId: string; accountId?:string;retryOf?:string }
interface OperationTracking {
  beginMutation(accountId:string,type:string,body:Record<string,unknown>):Promise<void>;
  acceptOperation(accountId:string,type:string,value:unknown):Promise<void>;
}
export interface DeletionCredential { requestId: string; credential: string }
export interface AccountState {
  version: 1; localEnabled: boolean; active: Active | null;
  revocations: Revocation[]; deletionChecks: DeletionCredential[];
  allPending: { operationId: string; accountId: string } | null;
}
export interface AccountStore { load(): Promise<AccountState | undefined>; save(state: AccountState): Promise<void> }
export interface RemoteReply { status: number; body: unknown; credential?: string; deletionCredential?: string }
export interface AccountRemote {
  online(): boolean;
  request(method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT', path: string, body?: unknown, credential?: string): Promise<RemoteReply>;
}
const empty = (): AccountState => ({ version: 1, localEnabled: false, active: null, revocations: [], deletionChecks: [], allPending: null });
export function validateCredential(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^Bearer [a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.[\w-]{43}$/i.test(value)) throw new ValidationError('INVALID_INPUT');
}
export function parseAccountState(value: unknown): AccountState {
  const state = object(value);
  keys(state, ['version','localEnabled','active','revocations','deletionChecks','allPending']);
  if (state.version !== 1 || typeof state.localEnabled !== 'boolean') throw new ValidationError('INVALID_INPUT');
  if (state.active !== null) {
    const active = object(state.active); keys(active, ['credential','view']); validateCredential(active.credential);
    const view = DTO.SessionView.parse(active.view);
    if (active.credential.split(' ')[1]!.split('.')[0] !== view.id || Date.parse(view.expiresAt) <= Date.parse(view.startedAt) || Date.parse(view.expiresAt)-Date.parse(view.startedAt)>7*86400000) throw new ValidationError('INVALID_INPUT');
  }
  for (const value of array(state.revocations)) { const entry = object(value); keys(entry, ['credential','operationId'],['accountId','retryOf']); validateCredential(entry.credential); uuid(entry.operationId);if(entry.accountId!==undefined)uuid(entry.accountId);if(entry.retryOf!==undefined)uuid(entry.retryOf); }
  for (const value of array(state.deletionChecks)) { const entry = object(value); keys(entry, ['requestId','credential']); uuid(entry.requestId); validateCredential(entry.credential); }
  if (state.allPending !== null) { const pending = object(state.allPending); keys(pending, ['operationId','accountId']); uuid(pending.operationId); uuid(pending.accountId); }
  return structuredClone(state) as unknown as AccountState;
}
export class AccountSession {
  private state = empty();
  private ready = false;
  private tail: Promise<unknown> = Promise.resolve();
  private tracking:OperationTracking|undefined;
  trackOperations(tracking:OperationTracking){this.tracking=tracking;}
  constructor(private readonly store: AccountStore, private readonly remote: AccountRemote) {}
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action); this.tail = result.catch(() => undefined); return result;
  }
  private async persist(next: AccountState) { const valid = parseAccountState(next); await this.store.save(valid); this.state = valid; }
  initialize() { return this.serial(async () => { const value = await this.store.load(); this.state = value ? parseAccountState(value) : empty(); this.ready = true; }); }
  status() {
    const active = this.state.active;
    return { localEnabled: this.state.localEnabled, storageReady: this.ready,
      remote: !active ? 'signed_out' : Date.parse(active.view.expiresAt)<=Date.now() ? 'expired' : active.view.accessClass === 'normal' ? 'active' : 'limited',
      revocationPending: this.state.revocations.length > 0, logoutAllPending: this.state.allPending !== null };
  }
  private requireReady() { if (!this.ready) throw new Error('El almacén protegido no está disponible.'); }
  private requireOnline() { if (!this.remote.online()) throw new Error('Se requiere conexión.'); }
  publicationActor(){this.requireReady();this.requireOnline();const a=this.state.active;if(!a||this.status().remote!=='active')throw Error('SESSION_REQUIRED');return {accountId:a.view.accountId,sessionId:a.view.id};}
  publicationRequest(actor:{accountId:string;sessionId:string},method:'GET'|'POST'|'PUT',path:string,body?:unknown){return this.serial(async()=>{
    const current=this.publicationActor();if(current.accountId!==actor.accountId||current.sessionId!==actor.sessionId||!publicationRoute(method,path))throw Error('ACCESS_DENIED');
    const reply=await this.remote.request(method,path,body,this.state.active!.credential);
    if(reply.status===401)await this.persist({...this.state,active:null});
    if(reply.status>=400)throw Error((reply.body as {code?:string})?.code??'REMOTE_UNAVAILABLE');
    return reply.body;
  });}
  login(email: string, password: string) {
    return this.serial(async () => {
      this.requireReady(); this.requireOnline();
      const reply = await this.remote.request('POST', '/sessions', { email, password, clientType: 'desktop' });
      if (reply.status !== 200) throw new Error('No se pudo iniciar sesión.');
      const view = DTO.SessionView.parse(reply.body); validateCredential(reply.credential);
      const active = { view, credential: reply.credential };
      try {
        let verified = false;
        if (view.accessClass === 'normal') {
          const profile = await this.remote.request('GET', '/account/profile', undefined, active.credential);
          if (profile.status !== 200) throw new Error('No se pudo verificar el acceso.');
          const value = DTO.AccountProfile.parse(profile.body);
          if (value.id !== view.accountId || !value.verifiedAt || value.status !== 'active') throw new Error('Acceso no verificado.');
          verified = true;
        }
        await this.persist({ ...this.state, active, localEnabled: this.state.localEnabled || verified });
      } catch (error) {
        try { await this.remote.request('DELETE', '/sessions/current', { operationId: randomUUID() }, active.credential); } catch { /* No claim of remote revocation if offline. */ }
        throw error;
      }
      return this.status();
    });
  }
  logout(retryOf?:string) {
    return this.serial(async () => {
      this.requireReady(); const active = this.state.active;
      if(retryOf!==undefined)uuid(retryOf);
      if (active) await this.persist({ ...this.state, active: null, revocations: [...this.state.revocations, { credential: active.credential, operationId: randomUUID(),accountId:active.view.accountId,...(retryOf?{retryOf}:{}) }] });
      await this.flushRevocations(); return this.status();
    });
  }
  private confirmed(reply: RemoteReply, operationId: string) {
    if (reply.status !== 200) return false;
    const result = DTO.MutationResult.parse(reply.body);
    return result.operationId === operationId && result.state === 'resolved' && (result.outcome === 'success' || result.outcome === 'no_change');
  }
  private async flushRevocations() {
    if (!this.remote.online()) return;
    for (const item of [...this.state.revocations]) {
      try {
        const body={operationId:item.operationId,...(item.retryOf?{retryOf:item.retryOf}:{})};
        if(item.accountId)await this.tracking?.beginMutation(item.accountId,'logout',body);
        const result = await this.remote.request('DELETE', '/sessions/current', body, item.credential);
        if (this.confirmed(result, item.operationId)){if(item.accountId)await this.tracking?.acceptOperation(item.accountId,'logout',result.body);await this.persist({ ...this.state, revocations: this.state.revocations.filter(entry => entry.operationId !== item.operationId) });}
      } catch { /* Persisted capability remains restricted to DELETE current. */ }
    }
  }
  logoutAll(confirmed: boolean,retryOf?:string) {
    return this.serial(async () => {
      this.requireReady(); this.requireOnline();
      if(retryOf!==undefined)uuid(retryOf);
      const active = this.state.active;
      if (!confirmed || !active || this.status().remote !== 'active' || this.state.allPending) throw new Error('Confirma el cierre con una sesión válida.');
      const operationId = randomUUID(), revocation = { operationId: randomUUID(), credential: active.credential,accountId:active.view.accountId };
      // Record uncertainty before sending; never automatically repeat revoke-all.
      await this.persist({ ...this.state, active: null, allPending: { operationId, accountId: active.view.accountId }, revocations: [...this.state.revocations, revocation] });
      try {
        const body={operationId,confirmation:true,...(retryOf?{retryOf}:{})};
        await this.tracking?.beginMutation(active.view.accountId,'revokeAll',body);
        const result = await this.remote.request('POST', '/sessions/revoke-all', body, active.credential);
        if (this.confirmed(result, operationId)) {
          await this.tracking?.acceptOperation(active.view.accountId,'revokeAll',result.body);
          await this.persist({ ...this.state, allPending: null, revocations: this.state.revocations.filter(entry => entry.operationId !== revocation.operationId) });
          return { ...this.status(), allResult: 'confirmed' as const };
        }
        if (result.status >= 400 && result.status < 500) {
          DTO.Error.parse(result.body);
          await this.persist({ ...this.state, allPending: null });
          return { ...this.status(), allResult: 'rejected' as const };
        }
      } catch { /* Keep result pending; local access is already closed. */ }
      return { ...this.status(), allResult: 'pending' as const };
    });
  }
  private async refreshCurrent() {
    const active = this.state.active;
    if (!active || !this.remote.online() || active.view.accessClass !== 'normal') return;
    const reply = await this.remote.request('GET', '/account/profile', undefined, active.credential);
    if (reply.status === 401 || reply.status === 403) { await this.persist({ ...this.state, active: null }); return; }
    if (reply.status !== 200) throw new Error('No se pudo comprobar la sesión.');
    const profile = DTO.AccountProfile.parse(reply.body);
    if (profile.id !== active.view.accountId || !profile.verifiedAt || profile.status !== 'active') throw new Error('Respuesta de cuenta inválida.');
  }
  refresh() { return this.serial(async () => { this.requireReady(); await this.refreshCurrent(); return this.status(); }); }
  reconnect() {
    return this.serial(async () => {
      this.requireReady(); if (!this.remote.online()) return this.status();
      await this.flushRevocations();
      const pending = this.state.allPending, active = this.state.active;
      if (pending && active?.view.accountId === pending.accountId && active.view.accessClass === 'normal') {
        try {
          const reply = await this.remote.request('GET', `/operations/${pending.operationId}?operationType=revokeAll`, undefined, active.credential);
          if (reply.status === 200) {
            const result = DTO.OperationView.parse(reply.body);
            if (result.operationId === pending.operationId && result.operationType === 'revokeAll' && result.state === 'resolved'){await this.tracking?.acceptOperation(pending.accountId,'revokeAll',{operationId:result.operationId,state:result.state,outcome:result.outcome,confirmedAt:result.confirmedAt,data:{}});await this.persist({ ...this.state, allPending: null });}
          }
        } catch { /* Until T051 is available, retain uncertainty rather than resend. */ }
      }
      await this.refreshCurrent(); return this.status();
    });
  }
  // Main-process only: T024 supplies this from a validated issuance response.
  rememberDeletionCredential(value: DeletionCredential) {
    return this.serial(async () => { this.requireReady(); uuid(value.requestId); validateCredential(value.credential); await this.persist({ ...this.state, deletionChecks: [...this.state.deletionChecks.filter(item => item.requestId !== value.requestId), value] }); });
  }
  checkDeletion(requestId: string) {
    return this.serial(async () => {
      this.requireReady(); this.requireOnline(); uuid(requestId);
      const item = this.state.deletionChecks.find(item => item.requestId === requestId);
      if (!item) throw new Error('No hay credencial para esa solicitud.');
      const reply = await this.remote.request('GET', `/deletion-status/${requestId}`, undefined, item.credential);
      if (reply.status !== 200) throw new Error('No se pudo comprobar la solicitud.');
      const result = DTO.DeletionStatus.parse(reply.body);
      if (result.requestId !== requestId) throw new Error('Respuesta de solicitud inválida.');
      return result; // Never infers deletion from a missing resource or credential.
    });
  }
  async action(action: string, input: unknown): Promise<RemoteReply> {
    if (action === 'login') { const body = DTO.Login.parse({ ...object(input), clientType: 'desktop' }); await this.login(body.email, body.password); return { status: 200, body: null }; }
    if (action === 'localLogout'||action==='localLogoutAll'){const value=input==null?{}:object(input);keys(value,[],['retryOf']);if(value.retryOf!==undefined)uuid(value.retryOf);return {status:200,body:action==='localLogout'?await this.logout(value.retryOf as string|undefined):await this.logoutAll(true,value.retryOf as string|undefined)};}
    if (action === 'checks') {
      const results = await deletionCheckBatch(this.state.deletionChecks.map(item=>item.requestId),id=>this.checkDeletion(id));
      return { status: 200, body: results };
    }
    return this.serial(async () => {
      this.requireReady();
      if (action === 'snapshot') return { status: 200, body: { ...this.status(), session: this.status().remote === 'expired' ? null : this.state.active?.view ?? null } };
      if (action === 'forgetSession') { await this.persist({ ...this.state, active: null }); return { status: 200, body: null }; }
      this.requireOnline();
      let path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body: unknown;
      if(isResourceQuery(action)){path=resourceQuery(action,input);method='GET';}
      else if (action === 'scope') {
        const accountId = object(input).accountId; uuid(accountId);
        if (accountId !== this.state.active?.view.accountId) throw new ValidationError('ACCESS_DENIED');
        path = `/destructive-scope?kind=account&id=${accountId}&action=delete-account`; method = 'GET';
      } else if (action === 'operation') {
        const value = object(input); uuid(value.operationId);
        if (value.accountId !== this.state.active?.view.accountId || typeof value.operationType !== 'string') throw new ValidationError('ACCESS_DENIED');
        path = `/operations/${value.operationId}?operationType=${encodeURIComponent(value.operationType)}`; method = 'GET';
      } else {
        const parsed = parseAccountAction({ action, body: input }); path = parsed.route.path; method = parsed.route.method.toUpperCase() as typeof method; body = parsed.body;
      }
      const reply = await this.remote.request(method, path, body, this.state.active?.credential);
      if (reply.status === 401 || (action === 'profile' && reply.status === 403)) await this.persist({ ...this.state, active: null });
      if (reply.status < 400 && ['deleteAccount','deletionCredential'].includes(action)) {
        const result = DTO.MutationResult.parse(reply.body);
        if (result.state === 'resolved' && result.outcome === 'success' && reply.deletionCredential) {
          const requestId = object(result.data).requestId; uuid(requestId); validateCredential(reply.deletionCredential);
          await this.persist({ ...this.state, deletionChecks: [...this.state.deletionChecks.filter(item => item.requestId !== requestId), { requestId: requestId as string, credential: reply.deletionCredential }] });
        }
      }
      return { status: reply.status, body: reply.body }; // Never forward either credential to renderer.
    });
  }
}

