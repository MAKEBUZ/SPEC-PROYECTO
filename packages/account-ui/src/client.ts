import { DTO } from '../../contracts/src/http-dto.js';
import { parseAccountAction, parsePending } from '../../contracts/src/account-actions.js';
import type { AccountAction, PendingAccountOperation } from '../../contracts/src/account-actions.js';
export interface Reply { status: number; body: unknown }
export interface AccountTransport {
  durableAdmission?:boolean;
  request(action: string, body?: unknown): Promise<Reply>;
}
export interface PendingStore { load(): unknown; save(value: PendingAccountOperation[]): void }
export class AccountClient {
  pending: PendingAccountOperation[];
  private currentAccountId:string|null=null;
  private listeners=new Set<()=>void>();
  private retryIntent:{accountId:string;operationId:string;type:string}|undefined;
  get accountId(){return this.currentAccountId;}
  set accountId(value:string|null){if(value!==this.currentAccountId){this.currentAccountId=value;this.retryIntent=undefined;this.changed();}}
  subscribe(listener:()=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private changed(){for(const listener of this.listeners)listener();}
  reconcileLegacy(accountId:string,ids:string[]){this.save(this.pending.filter(p=>p.accountId!==accountId||!ids.includes(p.operationId)));}
  async prepareRetry(id:string){const intent=await this.query('history',{kind:'retry',id}) as {accountId:string;operationId:string;type:string};if(intent.accountId!==this.accountId)throw Error('Inicia sesión de nuevo.');this.retryIntent=intent;return intent;}
  cancelRetry(){this.retryIntent=undefined;}
  get preparedRetryId(){return this.retryIntent?.operationId;}
  private checkRequest:Promise<unknown>|undefined;
  constructor(readonly transport: AccountTransport, private readonly store: PendingStore) { this.pending = parsePending(store.load()); }
  private save(value: PendingAccountOperation[]) {
    const key=(p:PendingAccountOperation)=>`${p.accountId}:${p.operationId}`;
    const kept=new Set(value.map(key)),removed=new Set(this.pending.filter(p=>!kept.has(key(p))).map(key));
    const merged=new Map(parsePending(this.store.load()).filter(p=>!removed.has(key(p))).map(p=>[key(p),p]));
    for(const entry of value)merged.set(key(entry),entry);
    const next=[...merged.values()];this.store.save(next);this.pending=next;
  }
  async query(action: string, body?: unknown) {
    if(action==='checks'){
      if(this.checkRequest)return this.checkRequest;
      const request=this.performQuery(action,body);
      this.checkRequest=request;
      try{return await request;}finally{if(this.checkRequest===request)this.checkRequest=undefined;}
    }
    return this.performQuery(action,body);
  }
  private async performQuery(action:string,body?:unknown){
    const retryType=action==='localLogout'?'logout':action==='localLogoutAll'?'revokeAll':null;
    if(retryType&&this.retryIntent?.type===retryType){const checked=await this.query('history',{kind:'retry',id:this.retryIntent.operationId}) as {accountId:string};if(checked.accountId!==this.accountId)throw Error('Inicia sesión de nuevo.');body={...(body as object??{}),retryOf:this.retryIntent.operationId};this.retryIntent=undefined;}
    const reply = await this.transport.request(action, body);
    if(['login','localLogout','localLogoutAll','forgetSession'].includes(action))this.changed();
    if (reply.status >= 400) throw new Error(this.message(reply));
    return reply.body;
  }
  private message(reply: Reply) {
    const body = reply.body as { message?: unknown; code?: string; fieldErrors?: { field: string }[] };
    const messages: Record<string,string> = {
      SCOPE_CHANGED: 'El contenido afectado cambió. Revisa de nuevo la eliminación antes de confirmarla.',
      REAUTHENTICATION_FAILED: 'La contraseña actual no es correcta.',
      TOKEN_INVALID: 'El enlace no es válido o ya se utilizó. Solicita uno nuevo.',
      TOKEN_EXPIRED: 'El enlace venció. Solicita uno nuevo.',
      SESSION_EXPIRED: 'La sesión venció. Inicia sesión de nuevo.',
      SESSION_REVOKED: 'La sesión dejó de estar vigente. Inicia sesión de nuevo.',
      RETENTION_EXPIRED: 'El plazo de recuperación terminó.',
      PASSWORD_TOO_WEAK: 'La contraseña no cumple la política requerida.',
    };
    if (body?.code && messages[body.code]) return messages[body.code]!;
    return typeof body?.message === 'string' ? body.message : 'No se pudo completar la solicitud. Comprueba la conexión y la sesión.';
  }
  async mutate(action: AccountAction | 'logout' | 'revokeAll', fields: Record<string, unknown> = {}) {
    try{return await this.performMutation(action,fields);}finally{this.changed();}
  }
  private async performMutation(action:AccountAction|'logout'|'revokeAll',fields:Record<string,unknown>){
    if(this.transport.durableAdmission&&this.accountId&&this.pending.some(p=>p.accountId===this.accountId)){
      const view=await this.query('history',{kind:'view',legacy:this.pending}) as {visible?:boolean;settledLegacyIds?:string[]};
      if(!view.visible&&!['logout','revokeAll'].includes(action))throw Error('Inicia sesión de nuevo para comprobar las operaciones pendientes.');
      if(view.visible&&Array.isArray(view.settledLegacyIds))this.reconcileLegacy(this.accountId,this.pending.filter(p=>p.accountId===this.accountId).map(p=>p.operationId));
    }
    if(this.retryIntent?.type===action){const checked=await this.query('history',{kind:'retry',id:this.retryIntent.operationId}) as {accountId:string};if(checked.accountId!==this.accountId)throw Error('Inicia sesión de nuevo.');fields={...fields,retryOf:this.retryIntent.operationId};this.retryIntent=undefined;}
    if ((!this.transport.durableAdmission||!this.accountId)&&this.pending.some(p => p.accountId === this.accountId && (p.operationType === action || (this.accountId !== null && !['logout','revokeAll'].includes(action))))) throw new Error('Resultado pendiente de comprobar. No se repetirá la operación.');
    const operationId = crypto.randomUUID(), body = { ...fields, operationId };
    if (action !== 'logout' && action !== 'revokeAll') parseAccountAction({ action, body });
    const pending = { operationId, operationType: action, accountId: this.accountId };
    // Authenticated hosts persist the authoritative journal before transport.
    // Do not retain a second copy past its account-deletion cleanup deadline.
    if(!this.transport.durableAdmission||!this.accountId)this.save([...this.pending, pending]);
    // US3 consumes this identity. Never persist passwords, tokens or payloads.
    let reply: Reply;
    try { reply = await this.transport.request(action, body); }
    catch { throw new Error('Resultado pendiente de comprobar. Comprueba la conexión; no se reenviará automáticamente.'); }
    if (reply.status >= 500) throw new Error('Resultado pendiente de comprobar. No se reenviará automáticamente.');
    if (reply.status >= 400) { DTO.Error.parse(reply.body); this.save(this.pending.filter(p => p.operationId !== operationId)); throw new Error(this.message(reply)); }
    const result = DTO.MutationResult.parse(reply.body);
    // Public reset deliberately acknowledges receipt without disclosing account
    // existence. It never promises that a message was sent or a password changed.
    if (action === 'resetRequest' && reply.status === 202 && result.operationId === operationId) {
      this.save(this.pending.filter(p => p.operationId !== operationId)); return { requested: true };
    }
    if (result.operationId !== operationId || result.state !== 'resolved') throw new Error('Resultado pendiente de comprobar.');
    this.save(this.pending.filter(p => p.operationId !== operationId));
    if (result.outcome === 'failure') throw new Error('La operación fue rechazada. Revisa los datos y vuelve a intentarlo.');
    return result.data;
  }
  async checkPending() {
    if(this.transport.durableAdmission&&this.accountId){
      const view=await this.query('history',{kind:'view',legacy:this.pending}) as {visible?:boolean;accountId?:string;pending?:{operationId:string}[]};
      if(!view.visible||view.accountId!==this.accountId||!Array.isArray(view.pending))throw Error('Inicia sesión de nuevo.');
      this.reconcileLegacy(this.accountId,this.pending.filter(p=>p.accountId===this.accountId).map(p=>p.operationId));
      for(const entry of view.pending)await this.query('history',{kind:'check',id:entry.operationId,manual:true});
      return;
    }
    for (const p of [...this.pending].filter(p => p.accountId === this.accountId && p.accountId !== null)) {
      const result = DTO.OperationView.parse(await this.query('operation', p));
      if (result.operationId === p.operationId && result.operationType === p.operationType && result.state === 'resolved') this.save(this.pending.filter(item => item.operationId !== p.operationId));
    }
  }
}
