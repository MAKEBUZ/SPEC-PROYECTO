import { randomUUID } from 'node:crypto';
import { mkdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument,validateDocument,type PatternDocument } from '../../../../../packages/document/src/schema.js';
import { canonicalize,revisionId } from '../../../../../packages/document/src/revision.js';
import { uuid } from '../../../../../packages/contracts/src/validation.js';
import { exclusiveWrite,sha256 } from '../documents/save.js';

/** Only trusted main-process evidence may classify a confirmed deletion. A 404,
 * missing permission, expired session or network error is always unknown. */
export type RemoteConflict = {kind:'unknown'|'trashed'|'version-conflict'|'deleted-confirmed'|'account-deleted-confirmed'};
export function remoteConflictPolicy(evidence:RemoteConflict):readonly string[]{
  switch(evidence.kind){
    case 'trashed':return ['keep-local','restore-remote'];
    case 'version-conflict':return ['keep-local','independent','load-remote'];
    case 'deleted-confirmed':case 'account-deleted-confirmed':return ['keep-local','publish-new'];
    default:return ['keep-local'];
  }
}
/** Candidate for a NEW local document. The caller must clear the file binding,
 * mark unsaved, and require explicit first publication; no remote side effect. */
export function independentPattern(input:PatternDocument):PatternDocument{
  const {remoteBinding:_,...snapshot}=structuredClone(validateDocument(input));
  const next={...snapshot,documentId:randomUUID()};next.revisionId=revisionId(next);return next;
}
export interface RemoteVersion {
  accountId:string;patternId:string;versionId:string;documentId:string;
  revisionId:string;sha256:string;bytes:number;
}
export interface ConflictDocument {
  snapshot():PatternDocument;
  /** Atomic compare-and-replace of the whole active document. Never overwrite
   * its existing local file. A successful replacement becomes an unsaved edit. */
  replace(expectedCanonical:string,next:PatternDocument):boolean;
}
/** No publication transport is available here: resolution cannot overwrite the
 * remote version or accidentally restore a trashed resource. */
export class ConflictResolver {
  private busy=false;
  constructor(private readonly backupDirectory:string,private readonly document:ConflictDocument){}
  async loadRemote(metadata:RemoteVersion,download:()=>Promise<Uint8Array>,confirmed:boolean){
    if(!confirmed)throw new Error('CONFIRMATION_REQUIRED');
    if(this.busy)throw new Error('CONFLICT_RESOLUTION_BUSY');
    this.busy=true;
    try {
      const version=structuredClone(metadata);
      for(const id of [version.accountId,version.patternId,version.versionId,version.documentId])uuid(id);
      if(!/^[a-f0-9]{64}$/.test(version.revisionId)||!/^[a-f0-9]{64}$/.test(version.sha256)||!Number.isSafeInteger(version.bytes)||version.bytes<0||version.bytes>100000000)throw new Error('ARTIFACT_MISMATCH');
      const local=structuredClone(validateDocument(this.document.snapshot())),expected=canonicalize(local);
      if(local.remoteBinding?.accountId!==version.accountId||local.remoteBinding.patternId!==version.patternId)throw new Error('REMOTE_BINDING_MISMATCH');
      const bytes=await download();
      if(bytes.byteLength!==version.bytes||sha256(bytes)!==version.sha256)throw new Error('ARTIFACT_MISMATCH');
      const remote=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(remote.documentId!==version.documentId||remote.revisionId!==version.revisionId||revisionId(remote)!==version.revisionId)throw new Error('ARTIFACT_MISMATCH');
      if(canonicalize(this.document.snapshot())!==expected)throw new Error('LOCAL_DOCUMENT_CHANGED');
      // The backup is a fresh exclusive file, not a replacement of the user's
      // file. Recompute the saved revision for current, potentially dirty edits.
      const backup={...local,revisionId:revisionId(local)},backupBytes=Buffer.from(JSON.stringify(backup));
      await mkdir(this.backupDirectory,{recursive:true,mode:0o700});
      const backupPath=join(this.backupDirectory,`${randomUUID()}.patron`);
      await exclusiveWrite(backupPath,backupBytes);
      const checked=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(backupPath)));
      if(canonicalize(checked)!==canonicalize(backup))throw new Error('BACKUP_UNCONFIRMED');
      remote.remoteBinding={accountId:version.accountId,patternId:version.patternId,lastPublishedVersion:version.versionId};
      if(!this.document.replace(expected,remote))throw new Error('LOCAL_DOCUMENT_CHANGED');
      return {backupPath,revisionId:remote.revisionId};
    }finally{this.busy=false;}
  }
}
