import {DTO,type HttpDto} from './http-dto.js';
import {uuid} from './validation.js';

/** Local transport envelope, not an HTTP endpoint. Failure carries no account
 * data or credential; each successful proof remains bound to its request. */
export async function deletionCheckBatch(ids:string[],query:(id:string)=>Promise<unknown>){
 const rows:HttpDto<'DeletionStatus'>[]=[];let failed=false;
 for(const id of [...new Set(ids)]){
  uuid(id);
  try{const row=DTO.DeletionStatus.parse(await query(id));if(row.requestId!==id)throw Error('DELETION_RESULT_INVALID');rows.push(row);}
  catch{failed=true;}
 }
 return failed?{rows,failed:true as const}:rows;
}
export function parseDeletionCheckBatch(value:unknown){
 let raw:unknown,failed=false;
 if(Array.isArray(value))raw=value;
 else if(value&&typeof value==='object'&&Object.keys(value).length===2&&'rows' in value&&'failed' in value&&value.failed===true){raw=value.rows;failed=true;}
 if(!Array.isArray(raw))throw Error('DELETION_RESULT_INVALID');
 const rows=raw.map(row=>DTO.DeletionStatus.parse(row));
 if(new Set(rows.map(row=>row.requestId)).size!==rows.length)throw Error('DELETION_RESULT_INVALID');
 return {rows,failed};
}
