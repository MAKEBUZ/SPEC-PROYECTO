import { productionMetadataIssues } from '../../../../../packages/document/src/piece.js';
import type { PiecePreview } from './geometry-preview.js';
import type { CadTools } from './tools.js';
import { ActionForm,Numeric,number } from './controls.js';
export function PiecePanel({tools,onError,preview,failed}:{tools:CadTools;onError:(s:string)=>void;preview:PiecePreview|undefined;failed:boolean}){
  const p=tools.document().pieces.find(p=>p.id===tools.selected);
  const issues=p?[...productionMetadataIssues(p),...(preview?.issues??[])]:[];
  if(!p)return <aside>Selecciona una pieza para editar sus datos.</aside>;
  return <aside key={JSON.stringify(p)}><h2>Propiedades de la pieza</h2>
    <ActionForm name="properties" title="Aplicar datos y marcas" onError={onError} run={f=>tools.properties({name:String(f.get('name')),sizeLabel:String(f.get('sizeLabel')),cutQuantity:String(f.get('cutQuantity')).trim()?number(f,'cutQuantity'):null,fold:f.get('fold')==='on',grainline:f.get('grainline')==='on'?{start:{x:number(f,'gx1'),y:number(f,'gy1')},end:{x:number(f,'gx2'),y:number(f,'gy2')}}:null})}>
      <label>Nombre<input name="name" defaultValue={p.name}/></label><label>Talla<input name="sizeLabel" defaultValue={p.sizeLabel}/></label>
      <label>Cantidad a cortar<input name="cutQuantity" defaultValue={p.cutQuantity??''}/></label>
      <label><input type="checkbox" name="grainline" defaultChecked={!!p.grainline}/>Línea de hilo</label>
      <p className="form-help">Marca la casilla y define dos puntos distintos para indicar la dirección del hilo.</p><div className="coordinate-grid"><Numeric name="gx1" label="Hilo inicio X (mm)" value={p.grainline?.start.x??0}/><Numeric name="gy1" label="Hilo inicio Y (mm)" value={p.grainline?.start.y??0}/>
      <Numeric name="gx2" label="Hilo fin X (mm)" value={p.grainline?.end.x??0}/><Numeric name="gy2" label="Hilo fin Y (mm)" value={p.grainline?.end.y??0}/></div>
      <label><input type="checkbox" name="fold" defaultChecked={p.fold}/>Corte al doblez</label><p className="form-help">Actívalo si esta pieza se corta sobre la tela doblada.</p>
    </ActionForm>
    <ActionForm name="margin" title="Aplicar margen" onError={onError} run={f=>tools.margin(String(f.get('width')).trim()?number(f,'width'):null)}><label>Ancho (mm), vacío para quitar<input name="width" defaultValue={p.seamWidth??''}/></label></ActionForm>
    <ActionForm name="corner" title="Cambiar esquina" onError={onError} run={f=>tools.corner(String(f.get('pointId')),f.get('join')==='round'?'round':'miter')}>
      <label>Vértice<select name="pointId">{p.contour.points.map((v,i)=><option key={v.id} value={v.id}>{i+1} — {p.cornerJoins[v.id]==='round'?'Redondeada':'Esquinada'}</option>)}</select></label>
      <label>Unión<select name="join"><option value="miter">Esquinada</option><option value="round">Redondeada</option></select></label>
    </ActionForm>
    <h3>Validación de la pieza</h3>{!preview&&<p role="status">{failed?'No se pudo completar la validación. El borrador se conserva.':'Calculando margen y validación… Puedes seguir editando y guardar.'}</p>}{issues.length?<><p>Corrige estos problemas antes de exportar. Puedes seguir editando el borrador.</p><ul>{[...new Set(issues)].map(i=><li key={i}>{({open:'Contorno abierto','zero-length':'Tramo de longitud cero','zero-area':'Área nula',crossing:'Cruce de contorno',contact:'Contacto de contorno',overlap:'Tramos superpuestos',name:'Falta nombre',sizeLabel:'Falta talla',cutQuantity:'Cantidad a cortar inválida',grainline:'Falta una línea de hilo válida','width-exceeded':'Ancho mayor que 5000 mm','height-exceeded':'Alto mayor que 5000 mm'} as Record<string,string>)[i]??`Geometría pendiente de corregir: ${i}`}</li>)}</ul></>:preview?<p>No se detectaron problemas en esta pieza. La preparación de impresión requiere su propia validación.</p>:null}
  </aside>;
}



