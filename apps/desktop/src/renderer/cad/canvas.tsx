import {ToolGroup} from '../ui.js';
import { useState,useSyncExternalStore } from 'react';
import {Scene} from './scene.js';
import { CadTools } from './tools.js';
import { ActionForm,Numeric,number } from './controls.js';
import { PiecePanel } from './piece-panel.js';
import { segmentControls } from '../../../../../packages/geometry/src/contour-validation.js';
import { useGeometryPreview } from './use-geometry-preview.js';
import type { PiecePreview } from './geometry-preview.js';

import './cad.css';
import type { DocumentActions } from '../documents/document-actions.js';

export function CadEditor({tools,documents}:{tools:CadTools;documents:DocumentActions}){

  useSyncExternalStore(tools.subscribe,tools.getVersion);const [error,setError]=useState('');
  const preview=useGeometryPreview(tools);
  const act=(fn:()=>unknown)=>{try{fn();setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
  const p=tools.document().pieces.find(p=>p.id===tools.selected);
  return <main className="cad editor-page"><div className="page-heading"><div><span className="eyebrow">DISEÑA CON PRECISIÓN</span><h1>Patronaje · CAD</h1><p className="page-description">Da forma a tus piezas. Selecciona una pieza para editar sus puntos, medidas y datos de corte.</p></div></div><p className="document-state">{tools.dirty?'Cambios sin guardar':'Documento sin cambios'} · Medidas internas en mm</p>
    <p role="alert" data-testid="cad-error">{error}</p>
    <nav className="editor-toolbar" aria-label="Acciones del patrón"><button onClick={()=>void documents.create()}>Nuevo documento</button><button onClick={()=>act(()=>tools.undo())} disabled={!tools.canUndo}>Deshacer</button><button onClick={()=>act(()=>tools.redo())} disabled={!tools.canRedo}>Rehacer</button>
    <label>Pieza<select aria-label="Pieza" value={p?.id??''} onChange={e=>tools.select(e.target.value)}><option value="">Seleccionar</option>{tools.document().pieces.map((v,i)=><option value={v.id} key={v.id}>{v.name||`Pieza ${i+1}`}</option>)}</select></label></nav>
    <div className="editor-grid"><div className="drawing-column"><div className="board-heading"><span>Tablero de dibujo</span><span>1 unidad = 1 mm</span></div>    <Scene tools={tools} onError={setError} previews={preview.pieces}/><p>Vista en {tools.unit}. Arrastra un espacio vacío para mover la vista; una cruz para editar el punto seleccionado. «Mover vista» permite arrastrar desde cualquier lugar.</p>    {!tools.document().pieces.length&&<div className="empty-guide"><h2>Empieza por tu primera pieza</h2><p>Pulsa «Nuevo contorno» o la tecla P y coloca cada punto con un clic. También puedes hacer clic derecho y elegir «Añadir punto aquí».</p></div>}
    {p&&<div className="board-actions"><button title="Une el último extremo con el primero para cerrar la pieza." onClick={()=>act(()=>tools.closeContour())}>Cerrar contorno</button><button title="Crea otra pieza independiente con la misma forma y datos." onClick={()=>act(()=>tools.duplicate())}>Duplicar pieza</button><button className="danger-button" onClick={()=>act(()=>tools.deletePiece(window.confirm('¿Eliminar esta pieza del documento local? Puedes deshacerlo.')))}>Eliminar pieza</button></div>}
    <div className="board-tip"><strong>Cómo trabajar aquí</strong><p>Mover vista y Centrar piezas solo cambian lo que ves. Para desplazar la pieza completa, usa «Mover pieza» en las herramientas de geometría. Ctrl+Z: deshacer · Ctrl+Y: rehacer · Rueda: zoom · P: puntos · Esc: terminar.</p></div>
    </div><div className="editor-inspector" aria-label="Herramientas de la pieza">
    {p&&<ToolGroup title="Puntos del contorno" description="Cada punto tiene sus propias coordenadas. También puedes arrastrar su cruz en el tablero.">{p.contour.points.map((point,i)=><ActionForm key={JSON.stringify(point)} name={`point-row-${point.id}`} title={`Aplicar punto ${i+1}`} onError={setError} run={f=>tools.point(i,number(f,'x'),number(f,'y'))}><div className="coordinate-grid"><Numeric name="x" label="X (mm)" value={point.x}/><Numeric name="y" label="Y (mm)" value={point.y}/></div></ActionForm>)}</ToolGroup>}
    {p&&<ToolGroup title="Datos, margen y marcas" description="Prepara la información de corte y revisa qué falta para poder exportar." open><PiecePanel tools={tools} onError={setError} preview={preview.pieces[p.id]} failed={preview.failed}/></ToolGroup>}
    <ToolGroup title="Coordenadas avanzadas" description="Entrada opcional para pegar coordenadas. Para dibujar, usa Nuevo contorno o P en el tablero.">    <ActionForm name="draw" title="Crear contorno" onError={setError} run={f=>{const rows=String(f.get('vertices')).trim().split('\n').map(line=>line.split(',').map(v=>v.trim()));const vertices=rows.map(r=>{if(r.length<2||!r[0]||!r[1])throw new Error('Indica X,Y por línea.');return [Number(r[0]),Number(r[1])] as const;});tools.draw(vertices,rows.map(r=>r[2]==='curva'?'cubic':'line'));}}><label>Puntos X,Y en mm, uno por línea; añade «,curva» para el tramo que sale del punto<textarea name="vertices" defaultValue={'0,0\n40,0\n40,30\n0,30'}/></label></ActionForm>
    </ToolGroup><ToolGroup title="Vista y ajustes" description="Configura la cuadrícula, el ajuste y el zoom. El tamaño real del patrón no cambia.">
    <ActionForm name="grid" title="Aplicar cuadrícula" onError={setError} run={f=>tools.configureGrid(number(f,'spacing'),f.get('snapGrid')==='on',f.get('snapEndpoints')==='on')}><Numeric name="spacing" label="Separación (mm)" value={tools.grid.spacing}/><label><input name="snapGrid" type="checkbox" defaultChecked={tools.grid.snapGrid}/>Ajustar a cuadrícula</label><label><input name="snapEndpoints" type="checkbox" defaultChecked={tools.grid.snapEndpoints}/>Ajustar a extremos</label></ActionForm>
    <ActionForm key={`${tools.unit}-${tools.zoom}`} name="view" title="Cambiar vista" onError={setError} run={f=>tools.view(f.get('unit')==='cm'?'cm':'mm',number(f,'zoom'))}><select name="unit" aria-label="Unidad de visualización"><option>mm</option><option>cm</option></select><Numeric name="zoom" label="Zoom" value={tools.zoom}/></ActionForm>

    </ToolGroup>{p&&<ToolGroup title="Puntos, curvas y transformaciones" description="Estas herramientas sí cambian el patrón. Puedes revertirlas con Deshacer.">
      <ActionForm name="point" title="Colocar punto" onError={setError} run={f=>tools.point(number(f,'index'),number(f,'x'),number(f,'y'))}><Numeric name="index" label="Índice de punto (desde 0)"/><Numeric name="x" label="X (mm)"/><Numeric name="y" label="Y (mm)"/></ActionForm>
      <ActionForm name="shiftPoint" title="Desplazar punto" onError={setError} run={f=>tools.shiftPoint(number(f,'index'),number(f,'dx'),number(f,'dy'))}><Numeric name="index" label="Índice de punto"/><Numeric name="dx" label="ΔX (mm)"/><Numeric name="dy" label="ΔY (mm)"/></ActionForm>
      <ActionForm name="insert" title="Añadir punto" onError={setError} run={f=>tools.addPoint(number(f,'after'),number(f,'x'),number(f,'y'))}><Numeric name="after" label="Tramo (desde 0)"/><Numeric name="x" label="X (mm)"/><Numeric name="y" label="Y (mm)"/></ActionForm>
      <ActionForm name="removePoint" title="Eliminar punto" onError={setError} run={f=>tools.removePoint(number(f,'index'),window.confirm('¿Eliminar este punto y los tramos incidentes? Puedes deshacerlo.'))}><Numeric name="index" label="Índice de punto"/></ActionForm>
      <ActionForm name="handle" title="Colocar tirador" onError={setError} run={f=>tools.handle(number(f,'segment'),f.get('end')==='start'?'start':'end',number(f,'x'),number(f,'y'))}><Numeric name="segment" label="Tramo"/><select name="end" aria-label="Tirador de la curva"><option value="start">Inicio</option><option value="end">Fin</option></select><Numeric name="x" label="X (mm)"/><Numeric name="y" label="Y (mm)"/></ActionForm>
      <ActionForm name="move" title="Mover pieza" onError={setError} run={f=>tools.move(number(f,'dx'),number(f,'dy'))}><Numeric name="dx" label="ΔX (mm)"/><Numeric name="dy" label="ΔY (mm)"/></ActionForm>
      <ActionForm name="rotate" title="Rotar pieza" onError={setError} run={f=>tools.rotate(number(f,'degrees'),number(f,'cx'),number(f,'cy'))}><Numeric name="degrees" label="Ángulo (grados)"/><Numeric name="cx" label="Centro X (mm)"/><Numeric name="cy" label="Centro Y (mm)"/></ActionForm>
      <ActionForm name="reflect" title="Reflejar pieza" onError={setError} run={f=>tools.reflect([number(f,'x1'),number(f,'y1')],[number(f,'x2'),number(f,'y2')])}><Numeric name="x1" label="Eje inicio X (mm)"/><Numeric name="y1" label="Eje inicio Y (mm)"/><Numeric name="x2" label="Eje fin X (mm)"/><Numeric name="y2" label="Eje fin Y (mm)" value={1}/></ActionForm>
      <table><caption>Coordenadas en {tools.unit}</caption><thead><tr><th>Punto</th><th>X</th><th>Y</th></tr></thead><tbody>{p.contour.points.map((v,i)=><tr key={v.id}><td>{i}</td><td>{v.x/(tools.unit==='cm'?10:1)}</td><td>{v.y/(tools.unit==='cm'?10:1)}</td></tr>)}</tbody></table>
    </ToolGroup>}

    </div></div>
    <output hidden data-testid="cad-snapshot">{JSON.stringify({documentId:tools.document().documentId,units:'mm',pieces:tools.document().pieces,grid:tools.grid.spacing,snapGrid:tools.grid.snapGrid,snapEndpoints:tools.grid.snapEndpoints})}</output>
  </main>;
}


