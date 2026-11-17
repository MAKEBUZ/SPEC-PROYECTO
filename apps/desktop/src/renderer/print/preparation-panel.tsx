import { userMessage } from '../messages.js';
import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import type { CadTools } from '../cad/tools.js';
import { ActionForm,Numeric,number } from '../cad/controls.js';
import type { Preparation } from '../../../../../packages/document/src/preparation.js';
import { preparationReferences } from '../../../../../packages/document/src/preparation.js';
import { segmentControls } from '../../../../../packages/geometry/src/contour-validation.js';
import type { PatternDocument } from '../../../../../packages/document/src/schema.js';
import type {DocumentActions} from '../documents/document-actions.js';
const observedGeometry=new WeakMap<CadTools,string>();
function PlacementView({document,preparation}:{document:PatternDocument;preparation:Preparation}){
  const pieces=document.pieces.filter(p=>preparation.selection.includes(p.id));
  const points=pieces.flatMap(p=>{const t=preparation.transforms[p.id]!,angle=t.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return p.contour.segments.flatMap(segment=>segmentControls(p.contour,segment.id)).map(v=>({x:v.x*c-v.y*s+t.x,y:v.x*s+v.y*c+t.y}));});
  if(points.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))return <p role="alert">No se puede representar esta colocación. Corrige los valores sin perder el documento.</p>;
  let minX=0,maxX=100,minY=0,maxY=100;for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  const spanX=maxX-minX+20,spanY=maxY-minY+20;if(!Number.isFinite(spanX)||!Number.isFinite(spanY))return <p>La composición excede la capacidad de esta vista.</p>;
  return <svg aria-label="Colocación de impresión" viewBox={`${minX-10} ${minY-10} ${spanX} ${spanY}`} className="placement-board">
    {pieces.map(p=>{const t=preparation.transforms[p.id]!,d=p.contour.segments.map(segment=>{const c=segmentControls(p.contour,segment.id),xy=(i:number)=>`${c[i]!.x},${c[i]!.y}`;return segment.kind==='line'?`M${xy(0)}L${xy(1)}`:`M${xy(0)}C${xy(1)} ${xy(2)} ${xy(3)}`;}).join(' ');return <g key={p.id} transform={`translate(${t.x} ${t.y}) rotate(${t.rotation})`}><path d={d} fill="none" stroke="#075985" strokeWidth="1" vectorEffect="non-scaling-stroke"/>{p.grainline&&<path d={`M${p.grainline.start.x},${p.grainline.start.y}L${p.grainline.end.x},${p.grainline.end.y}`} stroke="#15803d" strokeWidth="1" vectorEffect="non-scaling-stroke"/>}</g>;})}
  </svg>;
}
export function PreparationPanel({tools,documents}:{tools:CadTools;documents?:DocumentActions}){
  const [exportState,setExportState]=useState<{state:string;error?:string;name?:string}>({state:'idle'}),[jobId,setJobId]=useState('');
  const cancelling=useRef(false);
  const [selectionError,setSelectionError]=useState(''),[selectionReset,setSelectionReset]=useState(0);
  const selectionResult=(message:string)=>{
    setSelectionError(message==='PREPARATION_SELECTION_INVALID'||message==='Selecciona al menos una pieza. No se aplicó el cambio.'?'No se guardó la selección: debes seleccionar al menos una pieza. Se conserva la selección anterior y las casillas vuelven a mostrarla.':message?'No se pudo guardar la selección. Se conserva la selección anterior.':'');
    if(message)setSelectionReset(value=>value+1);
  };
  const exportProgress=(state:typeof exportState)=>{const terminal=['completed','failed','cancelled'].includes(state.state);if(cancelling.current&&!terminal)return;if(terminal)cancelling.current=false;setExportState(state);};
  const labels:Record<string,string>={registering:'PDF guardado; registrando para publicación',checking:'Comprobando exportación',starting:'Preparando exportación',generating:'Generando PDF',verifying:'Validando PDF',verified:'Validado',saving:'Guardando PDF',cancelling:'Cancelando',cancelled:'Exportación cancelada',completed:'PDF guardado',failed:'No se pudo exportar'};
  useSyncExternalStore(tools.subscribe,tools.getVersion,tools.getVersion);
  const document=tools.document(),preparations=document.preparations as Preparation[],[selected,setSelected]=useState(''),[error,setError]=useState(''),[changed,setChanged]=useState(false),observed=useRef<string|undefined>(observedGeometry.get(tools));
  const p=preparations.find(v=>v.id===selected),signature=JSON.stringify(document.pieces);
  useEffect(()=>{if(observed.current!==undefined&&observed.current!==signature)setChanged(true);observed.current=signature;observedGeometry.set(tools,signature);},[signature,tools]);
  const refs=p?preparationReferences(document,p):null;
  return <main className="cad"><h1>Preparación de impresión</h1><p className="page-description">Organiza tus piezas a tamaño real sin moverlas en el editor. Cada preparación conserva su propia colocación y papel.</p><ol className="flow-guide"><li><strong>Elige las piezas</strong><span>Crea una preparación o recupera una guardada.</span></li><li><strong>Ajusta el papel</strong><span>Configura los bordes y separa las piezas al menos 2 mm.</span></li><li><strong>Genera el PDF</strong><span>Guarda el documento y exporta la preparación seleccionada.</span></li></ol>
    {exportState.state!=='idle'&&<p role={exportState.state==='failed'?'alert':'status'}>{labels[exportState.state]??exportState.state}{exportState.name?`: ${exportState.name}`:''}{exportState.error?`: ${userMessage(exportState.error)}`:''}</p>}
    {tools.locked&&jobId&&<button disabled={exportState.state==='cancelling'} onClick={()=>{cancelling.current=true;setExportState({state:'cancelling'});void documents?.cancelExport(jobId).catch(e=>{cancelling.current=false;setError(String(e));setExportState({state:'checking'});});}}>Cancelar exportación</button>}
    <fieldset disabled={tools.locked}>
    <div className="preparation-toolbar"><p>{tools.dirty?'Documento modificado':'Documento sin cambios'}</p><button disabled={!tools.canUndo} onClick={()=>tools.undo()}>Deshacer</button><button disabled={!tools.canRedo} onClick={()=>tools.redo()}>Rehacer</button></div>
    {error&&<p role="alert">{error}</p>}{changed&&<p role="status">La geometría cambió. Se usa la geometría actual y se conservan las posiciones. Será necesario validar antes de exportar.</p>}
    <div className="preparation-picker"><ActionForm name="preparation-create" title="Crear preparación" onError={setError} run={f=>{tools.execute({type:'preparation.create',name:String(f.get('name')),selection:f.getAll('pieces').map(String)});setSelected(tools.document().preparations.at(-1)!.id as string);}}><label>Nombre<input name="name" required/></label>{document.pieces.map(piece=><label key={piece.id}><input type="checkbox" name="pieces" value={piece.id}/>{piece.name||'Pieza sin nombre'}</label>)}</ActionForm>
    <label>Preparación guardada<select value={p?.id??''} onChange={e=>{setSelected(e.target.value);setChanged(false);setSelectionError('');}}><option value="">Elige una preparación</option>{preparations.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
    {p&&<section key={p.id}><h2>{p.name}</h2>
      <div className="export-summary"><strong>Vas a exportar: {p.name}</strong><p>{p.mode==='large'?'Gran formato · una página':p.paper==='A4'?'Hojas A4':'Hojas Carta'} · {p.selection.length} piezas · margen imprimible de {p.margin} mm</p><p>Si hay cambios sin guardar, se pedirá guardarlos antes de generar. Se valida esta selección y su colocación.</p>{documents&&<button onClick={()=>{setJobId('');cancelling.current=false;void documents.exportPdf(p.id,exportProgress,setJobId).catch(e=>setError(String(e)));}}>Generar PDF</button>}</div><PlacementView document={document} preparation={p}/><p>Vista de colocación del contorno base; no es un PDF ni acredita validez para producción.</p>
      {!!refs?.missing.length&&<p role="alert">Hay piezas faltantes. Quítalas de la preparación o restaura las piezas originales antes de exportar.</p>}
      {!!refs?.available.length&&<p>Hay piezas fuera de esta selección. Puedes añadirlas manualmente.</p>}
      <ActionForm name="preparation-rename" title="Renombrar preparación" onError={setError} run={f=>tools.execute({type:'preparation.rename',id:p.id,name:String(f.get('name'))})}><input name="name" aria-label="Nuevo nombre" defaultValue={p.name} required/></ActionForm>
      <ActionForm name="preparation-duplicate" title="Duplicar preparación" onError={setError} run={f=>tools.execute({type:'preparation.duplicate',id:p.id,name:String(f.get('name'))})}><input name="name" aria-label="Nombre de la copia" required/></ActionForm>
      <ActionForm name="preparation-delete" title="Eliminar preparación" onError={setError} run={f=>tools.execute({type:'preparation.delete',id:p.id,confirmed:f.get('confirmed')==='on'})}><label><input name="confirmed" type="checkbox" required/>Eliminar «{p.name}». Podrás deshacer durante esta sesión.</label></ActionForm>
      <ActionForm key={`${p.id}-${JSON.stringify(p.selection)}-${selectionReset}`} name="preparation-selection" title="Guardar selección" onError={selectionResult} run={f=>tools.execute({type:'preparation.select',id:p.id,selection:f.getAll('pieces').map(String)})}>{[...document.pieces.map(piece=>({id:piece.id,name:piece.name||'Pieza sin nombre'})),...refs!.missing.map(id=>({id,name:'Pieza faltante'}))].map(piece=><label key={piece.id}><input type="checkbox" name="pieces" value={piece.id} defaultChecked={p.selection.includes(piece.id)}/>{piece.name}</label>)}</ActionForm>
      {selectionError&&<p role="alert" data-testid="selection-error">{selectionError}</p>}
      <ActionForm key={`${p.id}-${p.mode}-${p.paper}-${p.margin}`} name="preparation-config" title="Configurar papel" onError={setError} run={f=>tools.execute({type:'preparation.configure',id:p.id,mode:f.get('mode') as Preparation['mode'],paper:f.get('paper') as Preparation['paper'],margin:number(f,'margin')})}><label>Modalidad<select name="mode" defaultValue={p.mode}><option value="tiled">Hojas A4/Carta</option><option value="large">Gran formato</option></select></label><label>Papel<select name="paper" defaultValue={p.paper}><option value="A4">A4</option><option value="Letter">Carta</option></select></label><Numeric name="margin" label="Margen imprimible uniforme (mm)" value={p.margin}/></ActionForm>
      {p.selection.map(id=>{const t=p.transforms[id]!;return <ActionForm key={`${id}-${t.x}-${t.y}-${t.rotation}`} name={`placement-${id}`} title={`Colocar ${document.pieces.find(v=>v.id===id)?.name||'pieza'}`} onError={setError} run={f=>tools.execute({type:'preparation.transform',id:p.id,pieceId:id,transform:{x:number(f,'x'),y:number(f,'y'),rotation:number(f,'rotation')}})}><Numeric name="x" label="Desplazamiento X (mm)" value={t.x}/><Numeric name="y" label="Desplazamiento Y (mm)" value={t.y}/><Numeric name="rotation" label="Rotación (grados)" value={t.rotation}/></ActionForm>;})}
    </section>}
  </fieldset></main>;
}


