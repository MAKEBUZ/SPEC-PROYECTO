'use client';
import { useEffect,useState } from 'react';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { BrowserSession } from '../auth/session.js';
export async function verifiedFile(session:BrowserSession,file:HttpDto<'FileView'>){
  const response=await session.request(`/v1/files/${file.id}/content`);
  if(response.status!==200)throw new Error('No se pudo descargar el archivo completo. Comprueba tu sesión y vuelve a intentarlo.');
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==file.bytes||Number(response.headers.get('content-length'))!==file.bytes)throw new Error('La descarga está incompleta.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw new Error('No se pudo verificar la integridad del archivo.');
  return new Blob([bytes],{type:file.mediaType});
}
export function VersionFiles({files,session}:{files:HttpDto<'FileView'>[];session:BrowserSession}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<string>();
  useEffect(()=>{let disposed=false,url:string|undefined;setPreview(undefined);setError('');const file=files.find(f=>f.role==='preview');if(file)void verifiedFile(session,file).then(blob=>{if(disposed)return;url=URL.createObjectURL(blob);setPreview(url);}).catch(()=>{if(!disposed)setError('No se pudo cargar la vista previa privada.');});return()=>{disposed=true;if(url)URL.revokeObjectURL(url);};},[files,session]);
  async function download(file:HttpDto<'FileView'>){setBusy(true);setError('');try{const blob=await verifiedFile(session,file),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.originalName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){setError(e instanceof Error?e.message:'No se pudo descargar.');}finally{setBusy(false);}}
  return <section aria-label="Archivos de la versión"><h3>Archivos</h3>{preview&&<figure><img src={preview} alt="Vista previa del patrón" style={{maxWidth:'100%',height:'auto'}}/><figcaption>Vista previa. No utilizar para producción.</figcaption></figure>}
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Descargando y comprobando integridad…</p>}
    <ul>{files.filter(f=>f.role!=='preview').map(f=><li key={f.id}>{f.originalName} — {f.bytes} bytes. {f.role==='pdf'?f.measurement?'PDF de producción a escala 1:1. Imprime al 100 %, sin ajustar.':'PDF sin información de escala y dimensiones disponible.':'Documento editable para el CAD de Windows.'}
      {f.role==='pdf'&&f.measurement&&<p>Páginas: {f.measurement.pages.length}. Dimensiones: {[...new Set(f.measurement.pages.map(p=>`${p.widthMm.toLocaleString('es',{maximumFractionDigits:3})} × ${p.heightMm.toLocaleString('es',{maximumFractionDigits:3})} mm`))].join('; ')}.</p>}
      <button disabled={busy} onClick={()=>void download(f)}>Descargar {f.role==='pdf'?'PDF':'editable'}</button></li>)}</ul>
    {!files.some(f=>f.role==='pdf')&&<p>Esta versión no contiene PDF de producción.</p>}
  </section>;
}
