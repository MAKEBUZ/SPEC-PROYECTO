import { Controller,Get,Inject,Param,Req,Res } from '@nestjs/common';
import { pipeline } from 'node:stream/promises';
import type { Pool } from 'pg';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { SessionService } from '../auth/session.service.js';
import { inTransaction } from '../db/transaction.js';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import { LibraryService,libraryCredential } from '../library/library.controller.js';
import type { LibrarySession } from '../library/library.controller.js';
import type { BlobStore } from '../storage/blob-store.js';
import { safeFileName } from './file-view.js';
import { ValidationError,uuid } from '../../../../packages/contracts/src/validation.js';
import { verifiedDownload } from './verified-download.js';
export class DownloadService {
  constructor(private readonly pool:Pool,private readonly sessions:SessionService,private readonly library:LibraryService,private readonly store:BlobStore){}
  async read(s:LibrarySession,id:string,signal?:AbortSignal){
    uuid(id);
    const metadata=()=>inTransaction(this.pool,async c=>{await this.sessions.authorizeFor(c,s,'normal');const f=(await c.query('SELECT f.*,v.pattern_id FROM stored_files f JOIN versions v ON v.id=f.version_id WHERE f.id=$1',[id])).rows[0];if(!f)throw new ValidationError('RESOURCE_UNAVAILABLE');await this.library.active(c,s,f.pattern_id as string);await this.sessions.authorizeFor(c,s,'normal');return f;});
    const file=await metadata();
    const snapshot=await verifiedDownload(this.store.open(file.private_key as string,signal),Number(file.bytes),file.sha256 as string,signal);
    try {
      await metadata(); // Reauthorize after storage I/O, immediately before headers.
      signal?.throwIfAborted();
      return {...snapshot,name:safeFileName(file.original_name as string),mediaType:file.media_type as string,sha256:file.sha256 as string};
    } catch(error) { await snapshot.dispose(); throw error; }
  }
}
/** Single-range responses; unsupported multi-range is ignored as permitted by HTTP. */
export function byteRange(value:string|undefined,total:number):{start:number;end:number}|null|'invalid'{
  if(!value||!value.startsWith('bytes=')||value.includes(','))return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||!match[1]&&!match[2]||total===0)return 'invalid';
  let start:number,end:number;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return 'invalid';start=Math.max(0,total-suffix);end=total-1;}
  else {start=Number(match[1]);end=match[2]?Number(match[2]):total-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=total||end<start)return 'invalid';end=Math.min(end,total-1);}
  return {start,end};
}
@Controller()
export class DownloadController {
  constructor(@Inject(DownloadService) private readonly downloads:DownloadService){}
  @Get('files/:id/content') @ContractRoute('download')
  async get(@Req() req:IncomingMessage&{contractCredential?:Credential},@Param('id') id:string,@Res() reply:ServerResponse){
    const abort=new AbortController(),closed=()=>abort.abort();
    reply.once('close',closed);
    let file:Awaited<ReturnType<DownloadService['read']>>|undefined;
    try {
    file=await this.downloads.read(libraryCredential(req),id,abort.signal);const etag=`"${file.sha256}"`;
    const range=byteRange(req.headers['if-range']&&req.headers['if-range']!==etag?undefined:req.headers.range,file.size);
    reply.setHeader('Cache-Control','no-store');reply.setHeader('ETag',etag);reply.setHeader('Accept-Ranges','bytes');reply.setHeader('X-Content-Type-Options','nosniff');
    if(range==='invalid'){reply.statusCode=416;reply.setHeader('Content-Range',`bytes */${file.size}`);reply.end();return;}
    reply.setHeader('Content-Type',file.mediaType);reply.setHeader('Content-Disposition',`attachment; filename="archivo"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`);
    reply.statusCode=range?206:200;reply.setHeader('Content-Length',range?range.end-range.start+1:file.size);
    if(range)reply.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${file.size}`);
    await pipeline(file.stream(range??undefined),reply); // Started transfers may finish after revocation.
    } catch(error) {
      if(reply.headersSent||reply.destroyed) { reply.destroy(); return; }
      throw error;
    } finally { reply.off('close',closed);await file?.dispose(); }
  }
}
