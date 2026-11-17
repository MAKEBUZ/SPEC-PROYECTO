import {DTO} from '../../../contracts/src/http-dto.js';
import type {OperationScope} from './scopes.js';
export function resourceMutationQuery(type:string,body:Record<string,unknown>){
 const kind=type==='trashProject'?'project':type==='trashPattern'?'pattern':body.kind;
 if(!['trashProject','trashPattern','restore','purge'].includes(type))return null;
 return DTO.ScopeQuery.parse({kind,id:body.resourceId,action:type.startsWith('trash')?'trash':type});
}
/** Use the server's frozen reviewed scope; never trust resource names or infer
 * parent/child dependencies from arbitrary renderer fields. */
export function mutationScopes(accountId:string,type:string,body:Record<string,unknown>,scope?:unknown):OperationScope[]{
 const query=resourceMutationQuery(type,body);
 if(query){const view=DTO.ResourceScope.parse(scope),revisionMatches=type==='restore'?view.resources.some(r=>r.kind===view.kind&&r.id===view.id&&r.revision===body.expectedResourceRevision):view.scopeRevision===body.scopeRevision;if(view.kind!==query.kind||view.id!==query.id||view.action!==query.action||!revisionMatches)throw Error('SCOPE_CHANGED');return [{kind:view.kind,id:view.id},...view.resources.map(r=>({kind:r.kind,id:r.id}))].filter((r,i,all)=>all.findIndex(a=>a.kind===r.kind&&a.id===r.id)===i);}
 return [{kind:type==='updateProfile'?'profile':'account',id:accountId}];
}
export function admissionRejection(error:unknown,operationId:string){
 const code=error instanceof Error?error.message:'';
 if(!['OPERATION_PENDING','SCOPE_CHANGED','MUTATION_NOT_SENT'].includes(code))return null;
 return {status:409,body:{code,message:code==='OPERATION_PENDING'?'Hay una operación pendiente que afecta a estos recursos.':code==='SCOPE_CHANGED'?'El contenido afectado cambió. Revisa la operación.':'La operación no se envió. Comprueba la conexión.',traceId:crypto.randomUUID(),operationId}};
}
