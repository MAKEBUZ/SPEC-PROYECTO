import {spawn,spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
export async function retireLocalCopy(entry){
 const name=entry.target;if(!/^patron-backup-[a-f0-9-]{36}$/.test(name??''))throw Error('RESTORE_COPY_TARGET_INVALID');
 const list=spawnSync('docker',['ps','-a','--format','{{.Names}}'],{encoding:'utf8',windowsHide:true});if(list.status!==0)throw Error('RESTORE_COPY_UNVERIFIED');
 if(!list.stdout.trim().split(/\r?\n/).includes(name))return;
 const check=spawnSync('docker',['inspect',name],{encoding:'utf8',windowsHide:true});if(check.status!==0)throw Error('RESTORE_COPY_UNVERIFIED');const info=JSON.parse(check.stdout)[0];
 if(info.Config.Labels?.['patronaje.purpose']!=='backup-test'||info.Mounts.some(m=>m.Type!=='tmpfs'))throw Error('RESTORE_COPY_NOT_ISOLATED');
 const removed=spawnSync('docker',['rm','--force',name],{encoding:'utf8',windowsHide:true});if(removed.status!==0)throw Error('RESTORE_COPY_DELETE_FAILED');
}
/** Intentionally local-only validation transport, not an AWS operator. */
export function connectLocalPostgres(){
 const container=process.env.PATRON_LOCAL_PG_CONTAINER,user=process.env.PATRON_LOCAL_PG_USER,password=process.env.PATRON_LOCAL_PG_PASSWORD;
 if(!/^patron-backup-[a-f0-9-]{36}$/.test(container??'')||! /^[a-z_]+$/.test(user??'')||!password)throw Error('LOCAL_POSTGRES_CONFIG_REQUIRED');
 const inspect=spawnSync('docker',['inspect',container],{encoding:'utf8',windowsHide:true});
 if(inspect.status!==0)throw Error('LOCAL_POSTGRES_UNAVAILABLE');
 const info=JSON.parse(inspect.stdout)[0],ports=info.NetworkSettings.Ports['5432/tcp'];
 if(info.Config.Labels?.['patronaje.purpose']!=='backup-test'||ports?.length!==1||ports[0].HostIp!=='127.0.0.1'||info.Mounts.some(m=>m.Type!=='tmpfs'))throw Error('LOCAL_POSTGRES_NOT_ISOLATED');
 const applicationName='patron-backup-'+randomUUID();
 const pool=new Pool({host:'127.0.0.1',port:Number(ports[0].HostPort),database:'patron_backup',user,password,max:3,application_name:applicationName});
 const run=(tool,args,input)=>new Promise((resolve,reject)=>{
  if(!['pg_dump','pg_dumpall','psql','pg_restore'].includes(tool))return reject(Error('PG_TOOL_INVALID'));
  const child=spawn('docker',['exec','-i',container,tool,'-U',user,...(tool==='pg_dumpall'?['-l','patron_backup']:['-d','patron_backup']),...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const chunks=[];let size=0;const timer=setTimeout(()=>child.kill(),120000);
  child.stdout.on('data',b=>{size+=b.length;if(size>64*1024*1024)child.kill();else chunks.push(b);});child.stderr.resume();child.stdin.on('error',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(Error('PG_TOOL_FAILED'));});child.on('close',code=>{clearTimeout(timer);if(code!==0||size>64*1024*1024)reject(Error('PG_TOOL_FAILED:'+tool));else resolve(Buffer.concat(chunks));});child.stdin.end(input);
 });
 async function drain(){
  const client=await pool.connect();let previous,locked=false;
  try{
   const lock=await client.query('SELECT pg_try_advisory_lock(172904) AS acquired');if(!lock.rows[0].acquired)throw Error('BACKUP_ALREADY_RUNNING');locked=true;
   if((await client.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name<>$1 AND backend_type='client backend' LIMIT 1",[applicationName])).rowCount)throw Error('BACKUP_REQUIRES_STOPPED_APPLICATION');
   previous=(await client.query('SELECT datconnlimit FROM pg_database WHERE datname=current_database()')).rows[0].datconnlimit;
   await client.query('ALTER DATABASE patron_backup CONNECTION LIMIT 0');
   return {release:async()=>{try{await client.query('ALTER DATABASE patron_backup CONNECTION LIMIT '+Number(previous));await client.query('SELECT pg_advisory_unlock(172904)');}finally{client.release();}}};
  }catch(e){if(previous!==undefined)await client.query('ALTER DATABASE patron_backup CONNECTION LIMIT '+Number(previous)).catch(()=>{});if(locked)await client.query('SELECT pg_advisory_unlock(172904)').catch(()=>{});client.release();throw e;}
 }
 return {pool,run,drain,container};
}
