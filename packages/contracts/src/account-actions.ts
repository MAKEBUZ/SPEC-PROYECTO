import { DTO } from './http-dto.js';
import type { DtoName } from './http-dto.js';
import { ROUTES } from './routes.js';
import { object, keys, oneOf, uuid } from './validation.js';

export const ACCOUNT_ACTIONS = ['register','verificationRequest','verificationConfirm','resetRequest','resetConfirm','profile','updateProfile','password','deletion','deleteAccount','recoverAccount','deletionCredential','trashProject','trashPattern','restore','purge'] as const;
export type AccountAction = typeof ACCOUNT_ACTIONS[number];
export function parseAccountAction(input: unknown) {
  const value = object(input); keys(value, ['action','body']); oneOf(value.action, ACCOUNT_ACTIONS);
  const action = value.action as AccountAction;let route:{path:string;method:string;body?:string} = ROUTES[action],inputBody=value.body;
  if(['trashProject','trashPattern','restore','purge'].includes(action)){
    const fields=object(inputBody),{resourceId,kind,...rest}=fields;uuid(resourceId);
    if(action==='restore'||action==='purge')oneOf(kind,['project','pattern']);else if(kind!==undefined)throw Error('INVALID_INPUT');
    route={...route,path:route.path.replace('{id}',resourceId as string).replace('{kind}',kind as string??'')};inputBody=rest;
  }
  const body = route.body ? DTO[route.body as DtoName].parse(inputBody) : undefined;
  return { action, body, route };
}
export interface PendingAccountOperation { operationId: string; operationType: string; accountId: string | null }
export function parsePending(input: unknown): PendingAccountOperation[] {
  if (!Array.isArray(input)) throw new Error('Registro pendiente inválido.');
  return input.map(item => { const v = object(item); keys(v, ['operationId','operationType','accountId']); uuid(v.operationId); if (v.accountId !== null) uuid(v.accountId); oneOf(v.operationType, [...ACCOUNT_ACTIONS, 'logout','revokeAll']); return v as unknown as PendingAccountOperation; });
}
