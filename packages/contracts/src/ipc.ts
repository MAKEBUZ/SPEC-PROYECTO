import { keys, object, oneOf, text, uuid, ValidationError } from './validation.js';
import { validateDocument } from '../../document/src/schema.js';

export const IPC_FIELDS = {
  'account.action': ['action','body'],
  'account.status': [],
  'account.login': ['email','password'],
  'account.logout': [],
  'account.logoutAll': ['confirmed'],
  'account.refresh': [],
  'account.reconnect': [],
  'document.open': [],
  'document.register': ['documentId'],
  'document.confirmLeave': [],
  'document.confirmTrash': ['documentHandle','dirty'],
  'window.closeApproved': ['closeToken'],
  'window.closeCancelled': ['closeToken'],
  'document.save': ['documentHandle', 'snapshot', 'revisionId', 'mode'],
  'publication.prepare': ['documentHandle', 'revisionId'],
  'publication.pdfs': ['documentHandle', 'revisionId'],
  'publication.action': ['documentHandle','revisionId','action','body'],
  'publication.conflict': ['documentHandle','snapshot'],
  'publication.resolveConflict': ['documentHandle','snapshot','resolutionId','choice','confirmed'],
  'recovery.inspect': [],
  'recovery.capture': ['snapshot'],
  'recovery.restore': ['recoveryId', 'confirmed'],
  'recovery.discard': ['recoveryId', 'confirmed'],
  'export.generate': ['documentHandle', 'revisionId', 'preparationId'],
  'export.cancel': ['jobId'],
  'export.status': ['jobId'],
  'export.confirmSave': [],
  'document.trash': ['documentHandle', 'confirmed','confirmationId'],
} as const;
export type IpcMethod = keyof typeof IPC_FIELDS;
export interface IpcRequest { requestId: string; method: IpcMethod; [field: string]: unknown }
export type IpcResult<T> = { requestId: string } & (
  | { status: 'success'; data: T }
  | { status: 'cancelled' }
  | { status: 'error'; error: { code: string; message: string } }
);
export function parseIpcRequest(input: unknown): IpcRequest {
  const request = object(input); text(request.method); text(request.requestId);
  if (!request.requestId || !Object.hasOwn(IPC_FIELDS, request.method)) throw new ValidationError('INVALID_INPUT');
  const method = request.method as IpcMethod;
  keys(request, ['requestId', 'method', ...IPC_FIELDS[method]], method === 'recovery.inspect' ? ['documentHandle'] : method==='publication.prepare'?['pdfIds']:[]);
  const pdfIds=(value:unknown)=>{if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)))throw new ValidationError('INVALID_INPUT');};
  if(request.pdfIds!==undefined)pdfIds(request.pdfIds);
  for (const key of ['documentHandle', 'documentId', 'recoveryId', 'jobId', 'preparationId','closeToken','confirmationId','resolutionId']) if (key in request) uuid(request[key]);
  if ('dirty' in request) oneOf(request.dirty,[true,false]);
  if ('revisionId' in request) { text(request.revisionId); if (!/^[a-f0-9]{64}$/.test(request.revisionId)) throw new ValidationError('INVALID_INPUT'); }
  if ('confirmed' in request) oneOf(request.confirmed, [true]);
  if (method === 'account.login') { text(request.email); text(request.password); }
  if (method === 'account.action') text(request.action);
  if(method==='publication.resolveConflict')oneOf(request.choice,['independent','load-remote','publish-new']);
  if(method==='publication.action'){oneOf(request.action,['projects','createProject','status','check','publish','continue','abandon']);const body=object(request.body);if(request.action==='projects'){keys(body,[],['cursor']);if(body.cursor!==undefined)text(body.cursor);}else if(request.action==='createProject'){keys(body,['name']);text(body.name);}else if(request.action==='publish'){keys(body,['projectId','patternName'],['pdfIds']);uuid(body.projectId);text(body.patternName);if(body.pdfIds!==undefined)pdfIds(body.pdfIds);}else if(request.action==='abandon'){keys(body,['confirmed']);oneOf(body.confirmed,[true]);}else keys(body,[]);}
  if ('mode' in request) oneOf(request.mode, ['save', 'saveAs']);
  if ('snapshot' in request) validateDocument(request.snapshot);
  return request as IpcRequest;
}
