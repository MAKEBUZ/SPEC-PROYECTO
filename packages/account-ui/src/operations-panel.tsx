'use client';
import {useEffect,useState} from 'react';
import type {AccountClient} from './client.js';
import type {HistoryView,HistoryRow} from '../../document/src/operations/history-panel.js';
import {clientContextId} from './context-id.js';
const labels:Record<string,string>={updateProfile:'Cambiar perfil',password:'Cambiar contraseña',deleteAccount:'Eliminar cuenta',recoverAccount:'Recuperar cuenta',logout:'Cerrar sesión',revokeAll:'Cerrar todas las sesiones',deletionCredential:'Habilitar comprobación de eliminación',commitPublication:'Publicar versión',beginPublication:'Preparar publicación remota',createProject:'Crear proyecto',abandonPublication:'Descartar carga pendiente'};
const resultLabels={success:'Éxito confirmado',failure:'Fallo confirmado',no_change:'Sin cambios confirmado'};
const retryForms=new Set(['updateProfile','password','deleteAccount','logout','revokeAll']);
export function OperationsPanel({client}:{client:AccountClient}){
 const [view,setView]=useState<HistoryView|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState('');
 const [confirmation,setConfirmation]=useState<{scopeId:string;count:number}|null>(null);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true,running=false,checking=false,generation=0,cursor=0;
  const refresh=async()=>{if(running||!alive)return;running=true;const stamp=generation;
   try{const value=await client.query('history',{kind:'view',legacy:client.pending}) as HistoryView;if(!alive||stamp!==generation)return;setView(value);setError('');
    if(value.visible&&value.accountId)client.reconcileLegacy(value.accountId,client.transport.durableAdmission?client.pending.filter(p=>p.accountId===value.accountId).map(p=>p.operationId):value.settledLegacyIds);
    if(client.preparedRetryId&&(!value.visible||!value.resolved.some(r=>r.operationId===client.preparedRetryId&&r.outcome==='failure'))){client.cancelRetry();setRetry('');}
    const candidates=value.pending.filter(r=>!r.pause&&!['no_permission','unavailable'].includes(r.status));
    const candidate=value.online?candidates[cursor++%candidates.length]:undefined;
    if(candidate&&!checking){checking=true;void client.query('history',{kind:'check',id:candidate.operationId,manual:false}).catch(()=>{}).finally(()=>{checking=false;});}
   }catch{if(alive&&stamp===generation){setView(null);setError('No se pudo consultar el historial local. Los seguimientos se conservan.');}}finally{running=false;}
  };
  const changed=()=>{generation++;setView(null);setConfirmation(null);setRetry('');void refresh();};
  const unsubscribe=client.subscribe(changed);window.addEventListener('online',changed);window.addEventListener('offline',changed);
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('patron-account-state'):undefined;
  if(channel)channel.onmessage=event=>{if(event.data?.source===clientContextId())return;sessionStorage.removeItem('patron.session-view');client.accountId=null;changed();};
  void refresh();const timer=setInterval(()=>void refresh(),1000);
  return ()=>{alive=false;generation++;clearInterval(timer);unsubscribe();channel?.close();window.removeEventListener('online',changed);window.removeEventListener('offline',changed);};
 },[client,revision]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await action();setRevision(v=>v+1);}catch{setError('No se pudo completar la acción. Comprueba la sesión y vuelve a consultar el historial.');setView(null);setConfirmation(null);}finally{setBusy(false);}}
 async function prepare(ids:string[]){setConfirmation(await client.query('history',{kind:'prepareClear',ids}) as {scopeId:string;count:number});}
 const state=(r:HistoryRow)=>r.pause?'Consultas pausadas':!view?.online?'Resultado pendiente de comprobar — sin conexión':r.status==='no_permission'?'Sin permiso para comprobar':r.status==='unavailable'?'Resultado no disponible':'Resultado pendiente de comprobar';
 return <section aria-label="Operaciones de este dispositivo"><h2>Operaciones de este dispositivo</h2><p>Este historial pertenece a esta cuenta en este dispositivo; no incluye otros dispositivos.</p>
  {error&&<p role="alert">{error}</p>}
  {!view?.visible?<p>Inicia sesión válidamente para consultar Pendientes y Resueltas.</p>:<>
   {view.damaged&&<p role="status">Hay un registro local que no se pudo recuperar. Permanece aislado.</p>}
   {view.cleanupFailed&&<p role="status">No se pudo completar la limpieza local. Se reintentará automáticamente.</p>}
   <h3>Pendientes</h3>{!view.pending.length&&<p>No hay pendientes locales visibles.</p>}
   <ul>{view.pending.map(r=><li key={r.operationId}><strong>{labels[r.type]??r.type}</strong><p>{r.operationId}</p><p>{state(r)}</p>
    <button disabled={busy||!view.online} onClick={()=>void run(async()=>{await client.query('history',{kind:'check',id:r.operationId});})}>Comprobar ahora</button>
    <button disabled={busy} onClick={()=>void run(async()=>{await client.query('history',{kind:'pause',id:r.operationId,paused:!r.pause});})}>{r.pause?'Reanudar consultas':'Pausar consultas'}</button></li>)}</ul>
   <h3>Resueltas</h3><p>Resultados históricos, no una comprobación del estado actual del recurso. Se conservan 30 días desde su primera recepción.</p>
   {!view.resolved.length&&<p>No hay resultados locales vigentes.</p>}
   <button disabled={busy||!view.resolved.length} onClick={()=>void run(()=>prepare(view.resolved.map(r=>r.operationId)))}>Limpiar resueltas</button>
   <ul>{view.resolved.map(r=><li key={r.operationId}><strong>{labels[r.type]??r.type}</strong><p>{r.operationId}</p><p>{r.outcome?resultLabels[r.outcome]:''}</p>
    {r.outcome==='failure'&&retryForms.has(r.type)&&<button disabled={busy||!view.online} onClick={()=>void run(async()=>{await client.prepareRetry(r.operationId);setRetry('Reintento preparado. Completa y confirma de nuevo el formulario de '+(labels[r.type]??r.type)+'. Se validarán los datos actuales.');document.querySelector(`[data-operation-form="${r.type}"]`)?.scrollIntoView({block:'center'});})}>Preparar reintento</button>}
    <button disabled={busy} onClick={()=>void run(()=>prepare([r.operationId]))}>Eliminar entrada</button></li>)}</ul>
   {retry&&<p role="status">{retry}<button onClick={()=>{client.cancelRetry();setRetry('');}}>Cancelar reintento</button></p>}
   {confirmation&&<div role="dialog" aria-label="Confirmar limpieza local"><p>Eliminar {confirmation.count} entradas resueltas de esta cuenta, solo en este dispositivo. Se retirarán sus opciones de reintento. Los registros del servidor y las operaciones pendientes se conservan.</p>
    <button disabled={busy} onClick={()=>void run(async()=>{await client.query('history',{kind:'confirmClear',scopeId:confirmation.scopeId});setConfirmation(null);})}>Confirmar limpieza</button>
    <button disabled={busy} onClick={()=>void run(async()=>{await client.query('history',{kind:'cancelClear',scopeId:confirmation.scopeId});setConfirmation(null);})}>Cancelar limpieza</button></div>}
  </>}
 </section>;
}
