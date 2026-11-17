import type { PoolClient } from 'pg';
/** A display name is never a path, header fragment or storage key. */
export function safeFileName(name:string){return name.replace(/[\x00-\x1f\x7f/\\:"<>|?*]/g,'_').replace(/^\.+/,'_').trim()||'archivo';}
export async function fileViews(c:PoolClient,versionId:string){
  const rows=(await c.query(`SELECT id,role,original_name AS "originalName",media_type AS "mediaType",bytes::float8 AS bytes,sha256,document_id AS "documentId",local_revision_id AS "localRevisionId",export_profile_id AS "exportProfileId",preparation_id AS "preparationId",preparation_hash AS "preparationHash",pdf_measurement AS measurement FROM stored_files WHERE version_id=$1 ORDER BY role,id`,[versionId])).rows;
  return rows.map(f=>Object.fromEntries(Object.entries({...f,originalName:safeFileName(f.originalName as string)}).filter(([,v])=>v!==null)));
}
