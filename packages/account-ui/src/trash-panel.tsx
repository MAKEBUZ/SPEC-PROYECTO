import {useEffect,useRef,useState} from 'react';
import type {AccountClient} from './client.js';
import {DTO,type HttpDto} from '../../contracts/src/http-dto.js';
type Kind='project'|'pattern';type Action='trash'|'restore'|'purge';
type Item={kind:Kind;id:string;name:string;expiresAt?:string;recoverable?:boolean;parentProjectId?:string};
export function TrashPanel({client}:{client:AccountClient}){
 const [items,setItems]=useState<Item[]>([]),[level,setLevel]=useState<'project'|'pattern'|'trash'>('project'),[project,setProject]=useState(''),[cursor,setCursor]=useState<string|null>(null);
 const [review,setReview]=useState<HttpDto<'ResourceScope'>>(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
 const generation=useRef(0),working=useRef(false),bound=useRef<string|null>(null),alive=useRef(true);
 const reset=()=>{generation.current++;setItems([]);setReview(undefined);setCursor(null);setConfirmed(false);};
 async function run(action:(epoch:number)=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);setMessage('');const epoch=generation.current;
  try{await action(epoch);}catch(e){if(alive.current&&epoch===generation.current){setReview(undefined);setConfirmed(false);setMessage(e instanceof Error?e.message:'No se pudo completar la operación.');}}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 async function load(kind:'project'|'pattern'|'trash',id='',more=false){await run(async epoch=>{
  const profile=DTO.AccountProfile.parse(await client.query('profile'));if(!alive.current||epoch!==generation.current)return;
  if(bound.current&&bound.current!==profile.id){reset();setMessage('La cuenta cambió. Actualiza para consultar sus recursos.');bound.current=profile.id;client.accountId=profile.id;return;}
  bound.current=profile.id;client.accountId=profile.id;
  const raw=await client.query('resourceList',{kind,...kind==='pattern'?{id}:{},...more&&cursor?{cursor}:{}});if(!alive.current||epoch!==generation.current)return;
  let rows:Item[],next:string|null;
  if(kind==='trash'){const page=DTO.TrashPage.parse(raw);rows=page.items;next=page.nextCursor;}
  else if(kind==='project'){const page=DTO.ProjectPage.parse(raw);rows=page.items.map(p=>({kind:'project',id:p.id,name:p.name}));next=page.nextCursor;}
  else {const page=DTO.PatternPage.parse(raw);rows=page.items.map(p=>({kind:'pattern',id:p.id,name:p.name}));next=page.nextCursor;}
  setItems(old=>more?[...old,...rows]:rows);setCursor(next);setLevel(kind);setProject(kind==='pattern'?id:'');setReview(undefined);setConfirmed(false);
 });}
 async function inspect(item:Item,action:Action){await run(async epoch=>{
  const scope=DTO.ResourceScope.parse(await client.query('resourceScope',{kind:item.kind,id:item.id,action}));
  if(alive.current&&epoch===generation.current){setReview(scope);setConfirmed(false);}
 });}
 async function commit(){if(!review||!confirmed)return;const selected=review;await run(async epoch=>{
  const root=selected.resources.find(r=>r.id===selected.id);if(!root)throw Error('Vuelve a revisar el recurso.');
  const fields={resourceId:selected.id,confirmation:true};
  if(selected.action==='trash')await client.mutate(selected.kind==='project'?'trashProject':'trashPattern',{...fields,scopeRevision:selected.scopeRevision});
  else if(selected.action==='restore')await client.mutate('restore',{...fields,kind:selected.kind,expectedResourceRevision:root.revision});
  else await client.mutate('purge',{...fields,kind:selected.kind,scopeRevision:selected.scopeRevision,acknowledgePermanentLoss:true});
  if(alive.current&&epoch===generation.current){setReview(undefined);setConfirmed(false);setItems([]);setCursor(null);setMessage('Operación confirmada. Actualiza la lista para consultar su estado actual.');}
 });}
 useEffect(()=>{
  alive.current=true;void load('project');
  const invalidate=()=>{reset();setMessage('La sesión o conexión cambió. Actualiza con una sesión válida.');};
  const unsubscribe=client.subscribe(()=>{if(client.accountId!==bound.current)invalidate();});
  const verify=async()=>{if(!bound.current||working.current)return;try{const profile=DTO.AccountProfile.parse(await client.query('profile'));if(alive.current&&profile.id!==bound.current){client.accountId=null;invalidate();}}catch{if(alive.current){client.accountId=null;invalidate();}}};
  const timer=setInterval(()=>void verify(),15000);window.addEventListener('focus',verify);
  window.addEventListener('offline',invalidate);
  return()=>{alive.current=false;generation.current++;unsubscribe();clearInterval(timer);window.removeEventListener('focus',verify);window.removeEventListener('offline',invalidate);};
 },[client]);
 return <section aria-label="Papelera de la cuenta"><h1>Proyectos y papelera</h1><p>Estas acciones afectan solo a la cuenta. Los documentos y PDF guardados en tu equipo se conservan.</p>
  <nav><button disabled={busy} onClick={()=>void load('project')}>Proyectos activos</button><button disabled={busy} onClick={()=>void load('trash')}>Ver papelera</button><button disabled={busy} onClick={()=>void load(level,project)}>Actualizar lista</button><button disabled={busy} onClick={()=>void run(async()=>{await client.checkPending();setMessage('Resultados comprobados. Actualiza la lista.');})}>Comprobar pendientes</button></nav>
  {busy&&<p role="status">Consultando o guardando…</p>}{message&&<p role="alert">{message}</p>}
  <ul>{items.map(item=><li key={item.kind+item.id}><strong>{item.kind==='project'?'Proyecto':'Patrón'}: {item.name}</strong>
   {item.expiresAt&&<p>Recuperable hasta <time dateTime={item.expiresAt}>{new Date(item.expiresAt).toLocaleString('es')}</time>. El plazo no se amplía.</p>}
   {level!=='trash'?<>{item.kind==='project'&&<button disabled={busy} onClick={()=>void load('pattern',item.id)}>Ver patrones de {item.name}</button>}<button disabled={busy} onClick={()=>void inspect(item,'trash')}>Enviar {item.name} a papelera</button></>:<>
    {!item.recoverable&&<p>No recuperable individualmente ahora: comprueba el proyecto, el plazo y las operaciones pendientes.</p>}
    <button disabled={busy||!item.recoverable} onClick={()=>void inspect(item,'restore')}>Restaurar {item.name}</button><button disabled={busy} onClick={()=>void inspect(item,'purge')}>Eliminar definitivamente {item.name}</button>
   </>}
  </li>)}</ul>{cursor&&<button disabled={busy} onClick={()=>void load(level,project,true)}>Cargar más recursos</button>}
  {review&&<form aria-label="Revisar contenido afectado" onSubmit={e=>{e.preventDefault();void commit();}}><h2>{review.action==='trash'?'Enviar a papelera':review.action==='restore'?'Restaurar':'Eliminar definitivamente'}</h2>
   <ul>{review.resources.map(r=><li key={r.kind+r.id}>{r.kind==='project'?'Proyecto':'Patrón'}: {r.name}</li>)}</ul>
   <p>{review.versions} versiones; {review.files} archivos; {review.bytes} bytes asociados.</p>
   {review.action==='purge'?<p>Se perderá la posibilidad de recuperar estos recursos y su contenido asociado.</p>:review.action==='trash'?<p>El servidor conserva el contenido durante 30 días. Los patrones ya en papelera conservan su plazo original.</p>:<p>Solo se recupera este lote; los patrones eliminados por separado conservan su estado y plazo.</p>}
   {!!review.blockers.length&&<p role="alert">No se puede confirmar: hay recursos dependientes pendientes o el plazo de recuperación terminó. Revisa el proyecto y sus patrones.</p>}
   <label><input type="checkbox" required checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{review.action==='purge'?'Confirmo el recurso, su contenido y la pérdida de recuperación.':'Confirmo la operación sobre los recursos indicados.'}</label>
   <button disabled={busy||!confirmed||!!review.blockers.length}>Confirmar {review.action==='trash'?'envío a papelera':review.action==='restore'?'restauración':'eliminación definitiva'}</button>
   <button type="button" disabled={busy} onClick={()=>{setReview(undefined);setConfirmed(false);}}>Cancelar</button>
  </form>}
 </section>;
}
