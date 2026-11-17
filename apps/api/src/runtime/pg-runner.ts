import {spawn} from 'node:child_process';
import type {PgRunner} from '../storage/postgres-backup.js';
export function pgRunner(databaseUrl:string):PgRunner{
 const url=new URL(databaseUrl);
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};
 return (tool,args,input)=>new Promise((resolve,reject)=>{
  if(!['pg_dump','pg_dumpall','pg_restore','psql'].includes(tool))return reject(Error('PG_TOOL_INVALID'));
  const child=spawn(tool,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks:Buffer[]=[];
  let size=0,timeout=false;const timer=setTimeout(()=>{timeout=true;child.kill('SIGKILL');},120000);
  child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>512*1024*1024){timeout=true;child.kill('SIGKILL');}else chunks.push(b);});
  child.stderr.resume();child.stdin.on('error',()=>{});child.stdin.end(input);
  child.on('error',()=>{clearTimeout(timer);reject(Error('PG_TOOL_FAILED'));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0||timeout)reject(Error('PG_TOOL_FAILED'));else resolve(Buffer.concat(chunks));});
 });
}
