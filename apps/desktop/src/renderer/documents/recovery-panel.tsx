import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import type { CadTools } from '../cad/tools.js';
import { validateDocument } from '../../../../../packages/document/src/schema.js';
interface Candidate {recoveryId:string;documentId:string;savedAt:string;source?:string;state?:string}
export function RecoveryPanel({tools,onRecovered}:{tools:CadTools;onRecovered:()=>void}){
  useSyncExternalStore(tools.subscribe,tools.getVersion,tools.getVersion);
  const [rows,setRows]=useState<Candidate[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[damaged,setDamaged]=useState(false);
  const refreshingRef=useRef(false);
  const [refreshing,setRefreshing]=useState(false),[checkedAt,setCheckedAt]=useState('');
  const formatDate=(value:string)=>new Intl.DateTimeFormat('es-CO',{dateStyle:'short',timeStyle:'long'}).format(new Date(value));
  const refresh=async()=>{
    if(refreshingRef.current)return;refreshingRef.current=true;setRefreshing(true);setError('');
    try{
    const reply=await window.patron.request({requestId:crypto.randomUUID(),method:'recovery.inspect'});
    if(reply.status!=='success')throw Error(reply.error?.message||'No se pudieron consultar las copias.');
    const data=reply.data as {candidates:Candidate[];damaged:boolean};setRows([...data.candidates].sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));setDamaged(data.damaged);setCheckedAt(formatDate(new Date().toISOString()));
    }finally{refreshingRef.current=false;setRefreshing(false);}
  };
  useEffect(()=>{void refresh().catch(e=>setError(String(e.message)));},[]);
  const act=async(row:Candidate,kind:'restore'|'discard')=>{
    if(busy)return;
    if(kind==='restore'&&tools.dirty){setError('Conserva los cambios del documento actual antes de recuperar otra copia.');return;}
    if(!window.confirm(kind==='restore'?'¿Recuperar esta copia como documento sin guardar?':'¿Descartar esta copia de recuperación? No se eliminará el archivo original.'))return;
    const version=tools.getVersion();setBusy(true);setError('');
    try{
      const reply=await window.patron.request({requestId:crypto.randomUUID(),method:`recovery.${kind}`,recoveryId:row.recoveryId,confirmed:true});
      if(reply.status!=='success')throw Error(reply.error?.message||'No se pudo completar la recuperación.');
      if(kind==='restore'){tools.recover(validateDocument((reply.data as {snapshot:unknown}).snapshot),version);onRecovered();}
      else await refresh();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo completar la recuperación.');}finally{setBusy(false);}
  };
  return <section className="recovery-page"><h1>Recuperación local</h1><p>Las copias se recuperan sin guardar ni publicar. El documento original permanece intacto.</p>
    {tools.dirty&&<p>El documento actual tiene cambios sin guardar. Se conservarán; recupera otra copia cuando hayas terminado con ellos.</p>}
    {error&&<p role="alert">{error}</p>}{damaged&&<p role="alert">Hay copias dañadas o incompletas que no se pueden recuperar automáticamente.</p>}
    <button disabled={busy||refreshing} onClick={()=>void refresh().catch(e=>setError(e.message))}>{refreshing?'Actualizando copias…':'Actualizar copias'}</button><p role="status">{refreshing?'Consultando las copias guardadas…':checkedAt?`Copias actualizadas: ${checkedAt}. Horas del dispositivo.`:''}</p>
    {!refreshing&&!rows.length&&<p>No hay copias disponibles.</p>}
    <p className="help-note">Recuperar abre una copia como documento sin guardar. Usa «Guardar como» para conservarla en otro archivo. Descartar elimina solo la copia de recuperación.</p><ul className="recovery-list">{rows.map(row=><li key={row.recoveryId}>Documento {row.documentId} — <time dateTime={row.savedAt} title={row.savedAt}>{formatDate(row.savedAt)}</time>
      {row.source==='interrupted-save'&&<p>Copia del guardado interrumpido.</p>}
      {row.source==='previous-save'&&<p>Copia anterior al guardado interrumpido.</p>}
      {row.state==='destination-verified'&&<p>El destino coincide con el contenido escrito. Recuperar esta copia requiere guardarla explícitamente.</p>}
      {row.state==='unavailable'&&<p>No se pudo comprobar el destino original; la copia local está verificada.</p>}
      <button disabled={busy||refreshing||tools.dirty} onClick={()=>void act(row,'restore')}>Recuperar copia</button>
      <button disabled={busy||refreshing} onClick={()=>void act(row,'discard')}>Descartar copia</button>
    </li>)}</ul>
  </section>;
}

