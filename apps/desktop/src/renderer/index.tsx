import {PublishPanel} from './publication/publish-panel.js';
import { DeleteLocalDocument } from './documents/delete-dialog.js';
import { createRoot } from 'react-dom/client';
import { DesktopAccountPanel, desktopAccountClient } from './account/account-panel.js';
import {Icon,ThemeSwitch} from './ui.js';
import './workspace.css';
import { useEffect,useState,useSyncExternalStore } from 'react';
import { CadTools } from './cad/tools.js';
import { CadEditor } from './cad/canvas.js';
import { PreparationPanel } from './print/preparation-panel.js';
import { watchDeletionChecks } from '../../../../packages/account-ui/src/deletion-watch.js';
import { RecoveryPanel } from './documents/recovery-panel.js';
import { captureActiveDocument } from './documents/recovery-capture.js';
import { DocumentActions } from './documents/document-actions.js';
function Workspace(){
  const [saving,setSaving]=useState(false);
  const [maintenanceNotice,setMaintenanceNotice]=useState<string|null>(null);
  const [client]=useState(desktopAccountClient),[tools]=useState(()=>new CadTools()),[enabled,setEnabled]=useState(false),[tab,setTab]=useState<'account'|'cad'|'print'|'recovery'|'publication'>('account'),[recoveryError,setRecoveryError]=useState('');
  const [fileError,setFileError]=useState(''),[documents]=useState(()=>new DocumentActions(tools,r=>window.patron.request(r),setFileError));
  useSyncExternalStore(tools.subscribe,tools.getVersion,tools.getVersion);
  const save=async(mode:'save'|'saveAs'='save')=>{if(saving)return;setSaving(true);try{await documents.save(mode);}finally{setSaving(false);}};
  useEffect(()=>window.patron.onCloseRequested(token=>{void documents.close(token);}),[documents]);
  useEffect(()=>{if(enabled)return captureActiveDocument(tools,v=>window.patron.request(v),setRecoveryError);},[enabled,tools]);
  useEffect(()=>{
    const preventLoss=(event:BeforeUnloadEvent)=>{if(tools.dirty&&!documents.mayUnload()){event.preventDefault();event.returnValue='Cambios sin guardar';}};
    window.addEventListener('beforeunload',preventLoss);return ()=>window.removeEventListener('beforeunload',preventLoss);
  },[tools,documents]);
  useEffect(()=>{const watch=watchDeletionChecks(client,()=>{});return ()=>watch.dispose();},[client]);
  useEffect(()=>{let alive=true;const refresh=async()=>{try{const r=await window.patron.request({requestId:crypto.randomUUID(),method:'account.status'});if(alive){setEnabled(r.status==='success'&&(r.data as {localEnabled?:boolean})?.localEnabled===true);setMaintenanceNotice((r.data as {maintenanceNotice?:string|null})?.maintenanceNotice??null);}}catch{if(alive)setEnabled(false);}};void refresh();const timer=setInterval(()=>void refresh(),2000);return ()=>{alive=false;clearInterval(timer);};},[]);
  const pages=[{id:'cad',label:'Editor CAD',accessible:'Abrir CAD',hint:'Dibuja y ajusta tus piezas'},{id:'print',label:'Impresión',accessible:'Preparar impresión',hint:'Organiza y exporta a PDF'},{id:'publication',label:'Publicación',accessible:'Publicación',hint:'Versiones en tu cuenta'},{id:'recovery',label:'Recuperación',accessible:'Recuperación local',hint:'Retoma tu trabajo'},{id:'account',label:'Mi cuenta',accessible:'Cuenta',hint:'Acceso y documentos remotos'}] as const;
  const active=pages.find(p=>p.id===tab)!;
  return <div className="workspace-shell">
    <aside className="workspace-sidebar"><div className="brand"><span className="brand-symbol">P</span><div>PATRONAJE<small>Tu taller digital</small></div></div>
      <p className="nav-caption">ESPACIO DE TRABAJO</p><nav aria-label="Navegación principal">{pages.map(page=><button key={page.id} aria-label={page.accessible} title={`${page.label}: ${page.hint}`} aria-current={tab===page.id?'page':undefined} disabled={tools.locked||(page.id!=='account'&&!enabled)} onClick={()=>setTab(page.id)}><Icon name={page.id}/><span>{page.label}<small>{page.hint}</small></span></button>)}</nav>
      <div className="sidebar-bottom"><p>Tu archivo, bajo tu control.<br/><span>Guardar es local. Publicar es una acción aparte.</span></p><ThemeSwitch/></div>
    </aside>
    <div className="workspace-body"><header className="workspace-topbar"><div><span className="eyebrow">TU TALLER / {active.label.toUpperCase()}</span><strong>{active.hint}</strong></div><span className={`save-state ${tools.dirty?'is-dirty':''}`}>{saving?'Guardando…':tools.dirty?'Sin guardar':'Sin cambios'}</span><div className="file-actions"><button disabled={!enabled||tools.locked||saving} onClick={()=>void documents.open().then(()=>setTab('cad'))} title="Abre un archivo editable .patron de tu equipo.">Abrir archivo</button><button disabled={!enabled||tools.locked||saving} onClick={()=>void save('saveAs')} title="Guarda el documento con otro nombre; conserva el archivo anterior.">Guardar como</button><button className="primary" disabled={!enabled||tools.locked||saving} onClick={()=>void save()} title="Guarda las piezas y preparaciones en tu archivo local. No publica en la cuenta.">Guardar</button></div></header>
    <div className="workspace-content">
      {maintenanceNotice&&<p role="status">{maintenanceNotice}</p>}{fileError&&<p role="alert" data-testid="file-error">{fileError}</p>}{recoveryError&&<p role="alert">{recoveryError}</p>}
      {enabled&&tab==='cad'?<CadEditor tools={tools} documents={documents}/>:enabled&&tab==='print'?<PreparationPanel tools={tools} documents={documents}/>:enabled&&tab==='publication'?<PublishPanel tools={tools} documents={documents} client={client}/>:enabled&&tab==='recovery'?<RecoveryPanel tools={tools} onRecovered={()=>setTab('cad')}/>:<DesktopAccountPanel client={client}/>}
      {enabled&&<footer className="workspace-footer"><span>Archivos editables .patron · Medidas reales en milímetros</span><DeleteLocalDocument documents={documents} disabled={tools.locked}/></footer>}
    </div></div>
  </div>;
}
const root = createRoot(document.getElementById('root')!);
try { root.render(<Workspace />); }
catch { root.render(<main><h1>Cuenta</h1><p>No se pudo abrir el registro local. No se enviarán cambios.</p></main>); }



