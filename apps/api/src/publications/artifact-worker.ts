import {maintenanceFor} from '../storage/maintenance-gate.js';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { BlobStore } from '../storage/blob-store.js';
import type { RenderAssets } from '../../../../packages/print/src/profile.js';
import {DTO} from '../../../../packages/contracts/src/http-dto.js';
import {canonicalize} from '../../../../packages/document/src/revision.js';
interface Result {ok:boolean;code?:string;revisionId?:string;documentId?:string;measurement?:unknown}
export class ArtifactWorker {
  constructor(private readonly pool:Pool,private readonly store:BlobStore,private readonly assets:RenderAssets,private readonly runner:URL=new URL('./artifact-runner.js',import.meta.url)){}
  private run(input:unknown):Promise<Result>{return new Promise((resolve,reject)=>{
    const worker=new Worker(this.runner,{workerData:input,resourceLimits:{maxOldGenerationSizeMb:512}});let reply:Result|undefined;
    worker.once('message',(result:Result)=>{reply=result;});worker.once('error',reject);worker.once('exit',code=>{if(code===0&&reply)resolve(reply);else reject(new Error(`ARTIFACT_WORKER_EXIT_${code}`));});
  });}
  dispatchPending(){return maintenanceFor(this.pool).run(()=>this.dispatchAdmitted());}
  private async dispatchAdmitted(){
    const lock=await this.pool.connect();let acquired=false;
    try{
      acquired=(await lock.query<{locked:boolean}>('SELECT pg_try_advisory_lock($1) AS locked',[172902])).rows[0]!.locked;if(!acquired)return;
      const jobs=(await lock.query<{id:string;document_id:string;local_revision_id:string;manifest_hash:string}>("SELECT id,document_id,local_revision_id,manifest_hash FROM publications WHERE state='validating' ORDER BY created_at,id")).rows;
      for(const job of jobs){
        const files=(await lock.query<{file_id:string;role:string;private_key:string;sha256:string;export_profile_id:string|null;preparation_id:string|null;preparation_hash:string|null}>("SELECT file_id,role,private_key,sha256,export_profile_id,preparation_id,preparation_hash FROM publication_files WHERE publication_id=$1 AND upload_state='received' ORDER BY file_id",[job.id])).rows;
        let result:Result;
        try{
          const load=async(f:typeof files[number])=>{const bytes=await this.store.get(f.private_key);if(bytes.length>100000000||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw new Error('ARTIFACT_MISMATCH');return {...f,bytes};};
          const loaded=await Promise.all(files.filter(f=>f.role!=='pdf').map(load));
          const editable=loaded.find(f=>f.role==='editable'),preview=loaded.find(f=>f.role==='preview');if(!editable||!preview)throw new Error('ARTIFACT_MISMATCH');
          result=await this.run({editable:editable.bytes,preview:preview.bytes,profileId:preview.export_profile_id,assets:this.assets});
          // One PDF at a time: never buffer the account's complete quota.
          for(const file of files.filter(f=>f.role==='pdf')){
            if(!result.ok)break;
            const pdf=await load(file);
            result=await this.run({editable:editable.bytes,pdf:{bytes:pdf.bytes,profileId:pdf.export_profile_id,preparationId:pdf.preparation_id,preparationHash:pdf.preparation_hash},assets:this.assets});
            if(result.ok){
              if(result.revisionId!==job.local_revision_id||result.documentId!==job.document_id)throw Error('ARTIFACT_MISMATCH');
              const measured=DTO.PdfMeasurement.parse(result.measurement);if(measured.exportProfileId!==file.export_profile_id)throw Error('ARTIFACT_MISMATCH');
              await lock.query('INSERT INTO publication_pdf_proofs(publication_id,file_id,sha256,measurement) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING',[job.id,file.file_id,file.sha256,JSON.stringify(measured)]);
              const proof=(await lock.query('SELECT sha256,measurement FROM publication_pdf_proofs WHERE publication_id=$1 AND file_id=$2',[job.id,file.file_id])).rows[0];
              if(!proof||proof.sha256!==file.sha256||canonicalize(proof.measurement)!==canonicalize(measured))throw Error('ARTIFACT_MISMATCH');
            }
          }
          if(result.ok&&(result.revisionId!==job.local_revision_id||result.documentId!==job.document_id))result={ok:false,code:'ARTIFACT_MISMATCH'};
        }catch(e){result={ok:false,code:e instanceof Error&&e.message==='ARTIFACT_MISMATCH'?'ARTIFACT_MISMATCH':'INTERNAL_ERROR'};}
        await lock.query("UPDATE publications SET state='validated',validation_state=$2,validated_manifest_hash=$3,validation_error=$4 WHERE id=$1 AND state='validating'",[job.id,result.ok?'valid':'invalid',result.ok?job.manifest_hash:null,result.ok?null:result.code??'INTERNAL_ERROR']);
      }
    }finally{if(acquired)await lock.query('SELECT pg_advisory_unlock($1)',[172902]);lock.release();}
  }
}
