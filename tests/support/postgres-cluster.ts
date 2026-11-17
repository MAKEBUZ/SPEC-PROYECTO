import {spawnSync,spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PgRunner} from '../../apps/api/src/storage/postgres-backup.js';
function docker(args:string[],env=process.env){const r=spawnSync('docker',args,{env,encoding:'utf8',windowsHide:true,timeout:60000});if(r.error||r.status!==0)throw Error('LOCAL_POSTGRES_COMMAND_FAILED');return r.stdout.trim();}
/** Dedicated synthetic cluster, loopback only; never attaches user volumes. */
export async function postgresCluster(user:string){
 if(!/^[a-z_]+$/.test(user))throw Error('TEST_USER_INVALID');
 const name='patron-backup-'+randomUUID(),password=randomBytes(32).toString('hex');
 docker(['run','--detach','--name',name,'--label','patronaje.purpose=backup-test','--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD','--env',`POSTGRES_USER=${user}`,'--env','POSTGRES_DB=patron_backup','--tmpfs','/var/lib/postgresql:rw','postgres:18.7'],{...process.env,POSTGRES_PASSWORD:password});
 let pool:Pool|undefined;
 try{
  let ready=false;for(let i=0;i<60;i++){const p=spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U',user,'-d','patron_backup'],{windowsHide:true,timeout:5000});if(p.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error('LOCAL_POSTGRES_NOT_READY');
  const port=docker(['port',name,'5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];if(!port)throw Error('LOCAL_POSTGRES_NOT_LOOPBACK');
  pool=new Pool({host:'127.0.0.1',port:Number(port),user,password,database:'patron_backup',max:4});
  const run:PgRunner=(tool,args,input)=>new Promise((resolve,reject)=>{
   const db=tool==='pg_dumpall'?['-l','patron_backup']:['-d','patron_backup'];
   const child=spawn('docker',['exec','-i',name,tool,'-U',user,...db,...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   const chunks:Buffer[]=[];let size=0;const timeout=setTimeout(()=>{child.kill();},60000);
   child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>64*1024*1024){child.kill();return;}chunks.push(b);});child.stderr.resume();child.stdin.on('error',()=>{});
   child.on('error',()=>{clearTimeout(timeout);reject(Error('LOCAL_POSTGRES_TOOL_FAILED'));});child.on('close',code=>{clearTimeout(timeout);if(code!==0||size>64*1024*1024)reject(Error('LOCAL_POSTGRES_TOOL_FAILED:'+tool));else resolve(Buffer.concat(chunks));});child.stdin.end(input);
  });
  return {pool,run,environment:{PATRON_LOCAL_PG_CONTAINER:name,PATRON_LOCAL_PG_USER:user,PATRON_LOCAL_PG_PASSWORD:password},close:async()=>{if(!pool!.ended)await pool!.end();docker(['rm','--force',name]);}};
 }catch(e){await pool?.end();docker(['rm','--force',name]);throw e;}
}

