import {DTO} from './http-dto.js';
import {object,keys,oneOf,uuid,ValidationError} from './validation.js';
export const isResourceQuery=(action:string)=>action==='resourceList'||action==='resourceScope';
export function resourceQuery(action:string,input:unknown):string {
 if(action==='resourceScope'){
  const v=DTO.ScopeQuery.parse(input);if(v.kind==='account'||v.action==='delete-account')throw new ValidationError('INVALID_INPUT');
  return `/destructive-scope?kind=${v.kind}&id=${v.id}&action=${v.action}`;
 }
 if(action!=='resourceList')throw new ValidationError('INVALID_INPUT');
 const v=object(input);keys(v,['kind'],['id','cursor']);oneOf(v.kind,['project','pattern','trash']);
 if(v.kind==='pattern')uuid(v.id);else if(v.id!==undefined)throw new ValidationError('INVALID_INPUT');
 const page=DTO.Pagination.parse(v.cursor===undefined?{}:{cursor:v.cursor});
 const path=v.kind==='project'?'/projects':v.kind==='trash'?'/trash':`/projects/${v.id}/patterns`;
 return path+(page.cursor?`?cursor=${encodeURIComponent(page.cursor)}`:'');
}
export function resourceRoute(method:string,path:string):boolean{
 const id='[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}';
 if(method==='POST')return new RegExp(`^/(projects|patterns)/${id}/trash$`).test(path)||new RegExp(`^/trash/(project|pattern)/${id}/restore$`).test(path);
 if(method==='DELETE')return new RegExp(`^/trash/(project|pattern)/${id}$`).test(path);
 if(method!=='GET')return false;
 return /^\/(trash|projects)(?:\?cursor=[a-zA-Z0-9%_.~-]+)?$/.test(path)||new RegExp(`^/projects/${id}/patterns(?:\\?cursor=[a-zA-Z0-9%_.~-]+)?$`).test(path)||new RegExp(`^/destructive-scope\\?kind=(project|pattern)&id=${id}&action=(trash|restore|purge)$`).test(path);
}
