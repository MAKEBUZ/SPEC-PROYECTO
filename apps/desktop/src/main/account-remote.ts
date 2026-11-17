import type { AccountRemote, RemoteReply } from './account-session.js';
import {publicationRoute} from './publication/routes.js';
import {resourceRoute} from '../../../../packages/contracts/src/resource-actions.js';
import {createHash} from 'node:crypto';
export class HttpsAccountRemote implements AccountRemote {
  private readonly origin: string | undefined;
  constructor(origin: string | undefined, private readonly isOnline: () => boolean, private readonly fetcher: typeof fetch = fetch) {
    if (origin) {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Origen API inválido.');
      this.origin = url.origin;
    }
  }
  online() { return !!this.origin && this.isOnline(); }
  async request(method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT', path: string, body?: unknown, credential?: string): Promise<RemoteReply> {
    if (!this.online()) throw new Error('Se requiere conexión y configuración de API.');
    const allowed = (method === 'POST' && ['/sessions','/sessions/revoke-all','/accounts','/email-verification/request','/email-verification/confirm','/password-reset/request','/password-reset/confirm','/account/password','/account/deletion','/account/recovery','/account/deletion/credentials'].includes(path))
      || (method === 'PATCH' && path === '/account/profile')
      || (method === 'DELETE' && path === '/sessions/current') || (method === 'GET' && (path === '/account/profile'
      || path === '/account/deletion' || /^\/destructive-scope\?kind=account&id=[a-f\d-]{36}&action=delete-account$/i.test(path)
      || /^\/deletion-status\/[a-f\d-]{36}$/i.test(path) || /^\/operations\/[a-f\d-]{36}\?operationType=[a-zA-Z]+$/.test(path)));
    if (!allowed&&!publicationRoute(method,path)&&!resourceRoute(method,path)) throw new Error('Operación remota no admitida.');
    const binary=method==='PUT';if(binary&&(!(body instanceof Uint8Array)||body.byteLength>100000000))throw Error('INVALID_INPUT');
    const response = await this.fetcher(this.origin+'/v1'+path, { method, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: {
      ...(binary?{'Content-Type':'application/octet-stream','Content-Length':String((body as Uint8Array).length),'X-Content-Sha256':createHash('sha256').update(body as Uint8Array).digest('hex')}:body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(credential ? { Authorization: credential } : {}),
    }, ...(body === undefined ? {} : { body: binary?Buffer.from(body as Uint8Array):JSON.stringify(body) }) });
    if(method==='GET'&&/^\/files\/[a-f0-9-]{36}\/content$/.test(path)&&response.ok){
      const length=Number(response.headers.get('content-length'));if(response.status!==200||!Number.isSafeInteger(length)||length<0||length>100000000||!response.body)throw Error('ARTIFACT_MISMATCH');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>length||total>100000000)throw Error('ARTIFACT_MISMATCH');chunks.push(part.value);}if(total!==length)throw Error('ARTIFACT_MISMATCH');return {status:response.status,body:Buffer.concat(chunks,total)};}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
    return { status: response.status, body: await response.json(), ...(response.headers.get('authorization') ? { credential: response.headers.get('authorization')! } : {}), ...(response.headers.get('x-deletion-credential') ? { deletionCredential: response.headers.get('x-deletion-credential')! } : {}) };
  }
}
