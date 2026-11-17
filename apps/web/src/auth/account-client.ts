'use client';
import { BrowserSession } from './session.js';
import { AccountClient } from '../../../../packages/account-ui/src/client.js';
import { DTO } from '../../../../packages/contracts/src/http-dto.js';
import {deletionCheckBatch,parseDeletionCheckBatch} from '../../../../packages/contracts/src/deletion-check-batch.js';
import { parseAccountAction } from '../../../../packages/contracts/src/account-actions.js';
import {isResourceQuery,resourceQuery} from '../../../../packages/contracts/src/resource-actions.js';
import { uuid } from '../../../../packages/contracts/src/validation.js';
import {webOperationLifecycle} from '../operations/lifecycle.js';
import {mutationScopes,resourceMutationQuery,admissionRejection} from '../../../../packages/document/src/operations/mutation-admission.js';
import {clientContextId} from '../../../../packages/account-ui/src/context-id.js';
let sharedClient:AccountClient|undefined;
export function browserAccountClient(){return sharedClient??=createBrowserAccountClient();}
export function createBrowserAccountClient() {
  const session = new BrowserSession();
  const read = (key: string, fallback: unknown) => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as unknown;
  const checks = () => { const ids = read('patron.deletion-requests', []); if (!Array.isArray(ids)) throw new Error('Registro local inválido.'); ids.forEach(uuid); return ids as string[]; };
  const history=webOperationLifecycle().historyPanel({auth:async()=>{const raw=sessionStorage.getItem('patron.session-view'),view=raw?DTO.SessionView.parse(JSON.parse(raw)):null;return {accountId:view?.accountId??null,sessionId:view?.id??null,valid:!!view&&view.accessClass==='normal'&&Date.parse(view.expiresAt)>Date.now(),online:navigator.onLine};},query:async op=>{const r=await session.request('/v1/operations/'+op.operationId+'?operationType='+encodeURIComponent(op.type));const value=await r.json();if(r.status===401)sessionStorage.removeItem('patron.session-view');if(!r.ok)throw {code:(value as {code?:string}).code};return value;}});
  const transport = {durableAdmission:true, async request(action: string, input?: unknown) {
    const body = input as Record<string, unknown> | undefined;
    if(action==='history')return {status:200,body:await history.dispatch(input)};
    if (action === 'snapshot') {
      const stored = sessionStorage.getItem('patron.session-view');
      const view = stored ? DTO.SessionView.parse(JSON.parse(stored)) : null;
      return { status: 200, body: { session: view && Date.parse(view.expiresAt) > Date.now() ? view : null } };
    }
    if (action === 'forgetSession') { sessionStorage.removeItem('patron.session-view'); session.clearCsrf(); return { status: 200, body: null }; }
    if (action === 'checks') {
      const lifecycle=webOperationLifecycle(),epoch=lifecycle.capture();
      const batch=await deletionCheckBatch(checks(),async id=>{const response=await session.request('/v1/deletion-status/'+id);if(!response.ok)throw Error('DELETION_CHECK_FAILED');return response.json();});
      await lifecycle.acceptDeletion(parseDeletionCheckBatch(batch).rows,epoch);return { status: 200, body: batch };
    }
    let path: string, method: string, payload = input;
    if(isResourceQuery(action)){path=resourceQuery(action,input);method='GET';payload=undefined;}
    else if (action === 'login') { path = '/sessions'; method = 'POST'; payload = DTO.Login.parse({ ...body, clientType: 'web' }); }
    else if (action === 'logout' || action === 'revokeAll') { path = action === 'logout' ? '/sessions/current' : '/sessions/revoke-all'; method = action === 'logout' ? 'DELETE' : 'POST'; }
    else if (action === 'scope') { uuid(body?.accountId); path = `/destructive-scope?kind=account&id=${body!.accountId}&action=delete-account`; method = 'GET'; payload = undefined; }
    else if (action === 'operation') { uuid(body?.operationId); path = `/operations/${body!.operationId}?operationType=${encodeURIComponent(String(body!.operationType))}`; method = 'GET'; payload = undefined; }
    else { const parsed = parseAccountAction({ action, body: input }); path = parsed.route.path; method = parsed.route.method.toUpperCase(); payload = parsed.body; }
    const storedView=sessionStorage.getItem('patron.session-view');
    const boundAccount=storedView?DTO.SessionView.parse(JSON.parse(storedView)).accountId:null;
    const tracked=!!boundAccount&&typeof body?.operationId==='string'&&method!=='GET';
    if(tracked&&body?.retryOf!==undefined){const retry=await history.retry(body.retryOf as string);if(retry.type!==action)throw Error('RETRY_UNAVAILABLE');}
    if(tracked){
      let scope:unknown;
      try{
        if(!navigator.onLine)throw Error('MUTATION_NOT_SENT');
        const query=resourceMutationQuery(action,body!);
        if(query){const r=await session.request('/v1'+resourceQuery('resourceScope',query));if(!r.ok)return {status:r.status,body:await r.json()};scope=await r.json();}
        await session.prepare();
      }catch{return admissionRejection(Error('MUTATION_NOT_SENT'),body!.operationId as string)!;}
      try{await webOperationLifecycle().beginMutation(boundAccount!,action,body!,mutationScopes(boundAccount!,action,body!,scope));}
      catch(error){const rejected=admissionRejection(error,body!.operationId as string);if(rejected)return rejected;throw error;}
    }
    const response = await session.request('/v1'+path, { method, ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) });
    const value: unknown = await response.json();
    if(tracked&&response.ok)await webOperationLifecycle().acceptOperation(boundAccount!,action,value);
    if(boundAccount&&action==='operation'&&response.ok){const result=DTO.OperationView.parse(value);if(result.state==='resolved'&&result.operationId===body?.operationId&&result.operationType===body?.operationType)await webOperationLifecycle().acceptOperation(boundAccount,result.operationType,{operationId:result.operationId,state:result.state,outcome:result.outcome,confirmedAt:result.confirmedAt,data:{}});}
    if (response.status === 401 || (action === 'profile' && response.status === 403)) sessionStorage.removeItem('patron.session-view');
    if (response.ok && action === 'login') sessionStorage.setItem('patron.session-view', JSON.stringify(DTO.SessionView.parse(value)));
    if (response.ok && ['deleteAccount','deletionCredential'].includes(action)) {
      const result = DTO.MutationResult.parse(value);
      if (result.state === 'resolved' && result.outcome === 'success') { const id = (result.data as { requestId: string }).requestId; uuid(id); localStorage.setItem('patron.deletion-requests', JSON.stringify([...new Set([...checks(), id])]));if(boundAccount)await webOperationLifecycle().rememberDeletion(boundAccount,id); }
    }
    return { status: response.status, body: value };
  } };
  const client=new AccountClient(transport, { load: () => read('patron.account-pending', []), save: value => localStorage.setItem('patron.account-pending', JSON.stringify(value)) });
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('patron-account-state');channel.onmessage=event=>{if(event.data?.source===clientContextId())return;sessionStorage.removeItem('patron.session-view');session.clearCsrf();client.accountId=null;};}
  return client;
}
