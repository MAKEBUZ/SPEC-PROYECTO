import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import type {CadTools} from './tools.js';
import {segmentControls} from '../../../../../packages/geometry/src/contour-validation.js';
import type {PiecePreview} from './geometry-preview.js';
import {ActionForm,Numeric,number} from './controls.js';
export function Scene({tools,onError,previews}:{tools:CadTools;onError:(s:string)=>void;previews:Record<string,PiecePreview>}){
  const ref=useRef<HTMLCanvasElement>(null),drag=useRef<number|null>(null),panStart=useRef<{x:number;y:number;cx:number;cy:number}|null>(null);
  type Mode='edit'|'pan'|'draw'|'curve'|'round'|'roundPiece';
  const [mode,setMode]=useState<Mode>('edit'),[nextKind,setNextKind]=useState<'line'|'cubic'>('line'),[hint,setHint]=useState('');
  const sketch=useRef<string|null>(null),handleDrag=useRef<{index:number;end:'start'|'end'}|null>(null);
  const [ghost,setGhost]=useState<{index:number;end:'start'|'end';x:number;y:number}|null>(null);
  const [menu,setMenu]=useState<{x:number;y:number;world:{x:number;y:number}}|null>(null),menuRef=useRef<HTMLDivElement>(null);
  const [radius,setRadius]=useState('10');
  const panMode=mode==='pan';
  const perform=(action:()=>void)=>{try{action();onError('');}catch(e){onError(e instanceof Error?e.message:String(e));}};
  const begin=()=>{drag.current=null;handleDrag.current=null;panStart.current=null;setGhost(null);sketch.current=null;setMode('draw');setHint('Haz clic para colocar el primer punto. Cada clic añade un punto; pulsa el primero para cerrar.');ref.current?.focus({preventScroll:true});};
  const add=(position:{x:number;y:number})=>perform(()=>{
    const target=tools.snapPosition(position),current=tools.document().pieces.find(p=>p.id===sketch.current);
    setMode('draw');
    if(!current){sketch.current=tools.draw([[target.x,target.y]]);}
    else {tools.select(current.id);const first=current.contour.points[0];if(first&&current.contour.points.length>=3&&Math.hypot(first.x-target.x,first.y-target.y)<=8/tools.zoom){tools.closeContour(nextKind);sketch.current=null;setMode('edit');setHint('Contorno cerrado. Puedes ajustar sus puntos y tiradores.');return;}tools.extend(target.x,target.y,nextKind);}
    setHint('Punto añadido. Sigue haciendo clic; vuelve al primero para cerrar o pulsa Esc para terminar abierto.');
  });
  const nearestSegment=(point:{x:number;y:number})=>{
    const p=tools.document().pieces.find(p=>p.id===tools.selected);if(!p)return null;
    let best:{index:number;distance:number}|null=null;
    p.contour.segments.forEach((segment,index)=>{const c=segmentControls(p.contour,segment.id);const at=(t:number)=>{if(c.length===2)return {x:c[0]!.x+(c[1]!.x-c[0]!.x)*t,y:c[0]!.y+(c[1]!.y-c[0]!.y)*t};const u=1-t;return {x:u*u*u*c[0]!.x+3*u*u*t*c[1]!.x+3*u*t*t*c[2]!.x+t*t*t*c[3]!.x,y:u*u*u*c[0]!.y+3*u*u*t*c[1]!.y+3*u*t*t*c[2]!.y+t*t*t*c[3]!.y};};
      let a=at(0);for(let i=1;i<=64;i++){const b=at(i/64),dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/den)):0,distance=Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);if(!best||distance<best.distance)best={index,distance};a=b;}
    });return best as {index:number;distance:number}|null;
  };
  useEffect(()=>{sketch.current=null;setMode('edit');setMenu(null);setHint('');},[tools.documentEpoch]);
  useEffect(()=>{const p=tools.document().pieces.find(p=>p.id===sketch.current);if(mode==='draw'&&p?.contour.segments.length&&p.contour.segments[0]!.startId===p.contour.segments.at(-1)!.endId){sketch.current=null;setMode('edit');}},[tools.getVersion(),mode]);
  useEffect(()=>{if(menu)menuRef.current?.querySelector('button')?.focus();},[menu]);
  useEffect(()=>{const outside=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))setMenu(null);};window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);},[]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.isComposing||(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable=true]')))return;
      const k=e.key.toLowerCase();
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&(k==='z'||k==='y')){e.preventDefault();drag.current=null;handleDrag.current=null;panStart.current=null;setGhost(null);if(!tools.locked)perform(()=>{if(k==='y'||e.shiftKey)tools.redo();else tools.undo();});return;}
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      if(k==='escape'){setMenu(null);drag.current=null;handleDrag.current=null;panStart.current=null;setGhost(null);setMode('edit');sketch.current=null;setHint(mode==='draw'?'Trazado terminado. Los puntos dibujados se conservan.':'');ref.current?.focus({preventScroll:true});}
      if(k==='p'&&!tools.locked){e.preventDefault();if(mode!=='draw')begin();}
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[tools,mode]);
  const width=800,height=500;
  const fit=()=>{
    const points=tools.document().pieces.flatMap(p=>p.contour.segments.flatMap(s=>segmentControls(p.contour,s.id)));
    if(!points.length){tools.pan(0,0);tools.view(tools.unit,1);return;}
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
    if(!Number.isFinite(x1-x0)||!Number.isFinite(y1-y0)){onError('Estas coordenadas son demasiado grandes para encuadrarlas. El documento se conserva; corrígelas con las herramientas numéricas.');return;}
    const zoom=Math.max(.00000001,Math.min(4,700/Math.max(1,x1-x0),400/Math.max(1,y1-y0)));
    tools.pan(x0/2+x1/2,y0/2+y1/2);tools.view(tools.unit,zoom);
  };
  useEffect(()=>{if(mode!=='draw'||!sketch.current)fit();},[tools,tools.documentEpoch,tools.document().pieces.length]);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const geometries:THREE.BufferGeometry[]=[],materials:THREE.LineBasicMaterial[]=[];let renderer:THREE.WebGLRenderer|undefined;
    try{
      renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setSize(width,height,false);renderer.setClearColor(0xf8fafc);
      const scene=new THREE.Scene(),zoom=tools.zoom,camera=new THREE.OrthographicCamera(tools.viewCenter.x-width/2/zoom,tools.viewCenter.x+width/2/zoom,-tools.viewCenter.y+height/2/zoom,-tools.viewCenter.y-height/2/zoom,.1,100);camera.position.z=10;
      const line=(points:{x:number;y:number}[],color:number)=>{const g=new THREE.BufferGeometry().setFromPoints(points.map(v=>new THREE.Vector3(v.x,-v.y,0))),m=new THREE.LineBasicMaterial({color});geometries.push(g);materials.push(m);scene.add(new THREE.Line(g,m));};
      // Screen grid density may be coarsened; the configured snapping spacing is unchanged.
      const step=tools.grid.spacing*Math.max(1,Math.ceil(5/(tools.grid.spacing*zoom)));
      const left=tools.viewCenter.x-width/2/zoom,right=tools.viewCenter.x+width/2/zoom,top=tools.viewCenter.y-height/2/zoom,bottom=tools.viewCenter.y+height/2/zoom;
      for(let i=0,x=Math.ceil(left/step)*step;x<=right&&i<200;i++,x+=step)line([{x,y:top},{x,y:bottom}],x===0?0x94a3b8:0xe2e8f0);
      for(let i=0,y=Math.ceil(top/step)*step;y<=bottom&&i<200;i++,y+=step)line([{x:left,y},{x:right,y}],y===0?0x94a3b8:0xe2e8f0);
      for(const p of tools.document().pieces){
        if(ghost&&p.id===tools.selected){const s=p.contour.segments[ghost.index];if(s?.kind==='cubic'){if(ghost.end==='start')s.handleStart={x:ghost.x,y:ghost.y};else s.handleEnd={x:ghost.x,y:ghost.y};}}
        const color=previews[p.id]?.invalidBase?0xb91c1c:p.id===tools.selected?0x075985:0x64748b;
        for(const s of p.contour.segments){const c=segmentControls(p.contour,s.id),samples=c.length===2?c:Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return {x:u*u*u*c[0]!.x+3*u*u*t*c[1]!.x+3*u*t*t*c[2]!.x+t*t*t*c[3]!.x,y:u*u*u*c[0]!.y+3*u*u*t*c[1]!.y+3*u*t*t*c[2]!.y+t*t*t*c[3]!.y};});line(samples,color);
          if(p.id===tools.selected&&s.kind==='cubic'){line([c[0]!,s.handleStart],0xc2410c);line([c.at(-1)!,s.handleEnd],0xc2410c);for(const h of [s.handleStart,s.handleEnd]){const r=5/zoom;line([{x:h.x-r,y:h.y},{x:h.x,y:h.y-r},{x:h.x+r,y:h.y},{x:h.x,y:h.y+r},{x:h.x-r,y:h.y}],0xc2410c);}}
        }
        for(const v of p.contour.points){const r=3/zoom;line([{x:v.x-r,y:v.y},{x:v.x+r,y:v.y}],color);line([{x:v.x,y:v.y-r},{x:v.x,y:v.y+r}],color);}
        if(p.grainline)line([p.grainline.start,p.grainline.end],0x15803d);
        for(const points of previews[p.id]?.margin??[])line(points,0x9333ea);
      }
      renderer.render(scene,camera);
    }catch{onError('No se pudo dibujar la escena. El documento se conserva y las herramientas numéricas siguen disponibles.');}
    return ()=>{for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer?.dispose();};
  },[tools,tools.getVersion(),previews,ghost]);
  const world=(e:React.PointerEvent<HTMLCanvasElement>)=>{const b=e.currentTarget.getBoundingClientRect();return {x:tools.viewCenter.x+((e.clientX-b.left)*width/b.width-width/2)/tools.zoom,y:tools.viewCenter.y+((e.clientY-b.top)*height/b.height-height/2)/tools.zoom};};
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();if(drag.current!==null||handleDrag.current||panStart.current)return;const b=canvas.getBoundingClientRect(),px=(e.clientX-b.left)*width/b.width-width/2,py=(e.clientY-b.top)*height/b.height-height/2,old=tools.zoom,delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?500:1),zoom=Math.max(.0001,Math.min(100,old*Math.exp(-Math.max(-200,Math.min(200,delta))*.002)));tools.pan(tools.viewCenter.x+px/old-px/zoom,tools.viewCenter.y+py/old-py/zoom);tools.view(tools.unit,zoom);};
    canvas.addEventListener('wheel',wheel,{passive:false});return()=>canvas.removeEventListener('wheel',wheel);
  },[tools]);
  const selected=tools.document().pieces.find(p=>p.id===tools.selected);
  const down=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    ref.current?.focus({preventScroll:true});setMenu(null);if(e.button===2)return;
    if(panMode||e.button===1){e.preventDefault();panStart.current={x:e.clientX,y:e.clientY,cx:tools.viewCenter.x,cy:tools.viewCenter.y};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(e.button!==0)return;const point=world(e);
    if(mode==='draw'){add(point);return;}
    if(mode==='curve'){const hit=nearestSegment(point);if(hit&&hit.distance<=12/tools.zoom){perform(()=>tools.curve(hit.index));setMode('edit');setHint('Arrastra los rombos naranjas para ajustar la curva. Ctrl+Z deshace el cambio.');}else setHint('Haz clic cerca del tramo que quieras convertir en curva.');return;}
    const hits=(selected?.contour.points??[]).map((v,i)=>({i,v,d:Math.hypot(v.x-point.x,v.y-point.y)})).sort((a,b)=>a.d-b.d);
    if(mode==='roundPiece'){if(hits[0]&&hits[0].d<=12/tools.zoom){setHint('');perform(()=>{tools.roundPieceCorner(hits[0]!.v.id,Number(radius));setHint('Esquina de la pieza redondeada. Ctrl+Z recupera el contorno anterior.');});}else setHint('Pulsa la cruz de una esquina entre dos tramos rectos.');return;}
    if(mode==='round'){if(hits[0]&&hits[0].d<=12/tools.zoom){perform(()=>tools.corner(hits[0]!.v.id,'round'));setHint(selected?.seamWidth?'Esquina del margen redondeada. El contorno base se conserva.':'Esquina configurada. Aplica un margen mayor que 0 para ver el redondeado.');}else setHint('Pulsa la cruz de la esquina que quieres redondear.');return;}
    const handles=selected?.contour.segments.flatMap((s,index)=>s.kind==='cubic'?(['start','end'] as const).map(end=>({index,end,h:end==='start'?s.handleStart:s.handleEnd})):[])??[];
    const handle=handles.map(v=>({...v,d:Math.hypot(v.h.x-point.x,v.h.y-point.y)})).sort((a,b)=>a.d-b.d)[0];
    if(handle&&handle.d<=8/tools.zoom){handleDrag.current={index:handle.index,end:handle.end};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(hits[0]&&hits[0].d<=8/tools.zoom){drag.current=hits[0].i;e.currentTarget.setPointerCapture(e.pointerId);}
    else{panStart.current={x:e.clientX,y:e.clientY,cx:tools.viewCenter.x,cy:tools.viewCenter.y};e.currentTarget.setPointerCapture(e.pointerId);}
  };
  const reset=()=>{drag.current=null;panStart.current=null;handleDrag.current=null;setGhost(null);};
  return <><div className="viewport-toolbar" aria-label="Controles del tablero">
    <button className="primary" disabled={tools.locked} aria-pressed={mode==='draw'} onClick={begin}>Nuevo contorno · P</button>
    <button aria-pressed={mode==='edit'} onClick={()=>{setMode('edit');sketch.current=null;}}>Editar puntos</button><button aria-pressed={panMode} onClick={()=>setMode('pan')}>Mover vista</button>
    <button disabled={!selected||tools.locked} aria-pressed={mode==='curve'} onClick={()=>{setMode('curve');setHint('Haz clic en una línea para curvarla. Después arrastra sus tiradores naranjas.');}}>Curvar tramo</button>
    <button disabled={!selected||tools.locked} aria-pressed={mode==='round'} onClick={()=>{setMode('round');setHint('Pulsa una esquina para redondear el margen de costura. No modifica el contorno base.');}}>Redondear margen</button>
    <button disabled={!selected||tools.locked} aria-pressed={mode==='roundPiece'} onClick={()=>{setMode('roundPiece');setHint('Elige el radio y pulsa una esquina. Modifica el contorno real; Ctrl+Z lo deshace.');}}>Redondear pieza</button>
    <button onClick={fit}>Centrar piezas</button><button aria-label="Alejar vista" onClick={()=>tools.view(tools.unit,Math.max(.0001,tools.zoom/1.25))}>−</button><span>{Math.round(tools.zoom*100)} %</span><button aria-label="Acercar vista" onClick={()=>tools.view(tools.unit,Math.min(100,tools.zoom*1.25))}>+</button>
  </div>
  {mode==='draw'&&<div className="drawing-assistant"><strong>Coloca los puntos con clics</strong><label>Próximo tramo<select aria-label="Próximo tramo" value={nextKind} onChange={e=>setNextKind(e.target.value==='cubic'?'cubic':'line')}><option value="line">Recto</option><option value="cubic">Curvo</option></select></label><button onClick={()=>{setMode('edit');sketch.current=null;setHint('Trazado terminado. Puedes seguir editando sus puntos.');}}>Terminar trazado · Esc</button><p>Vuelve al primer punto para cerrar. Cada punto se guarda en el borrador y se puede deshacer.</p></div>}
  {mode==='roundPiece'&&<div className="drawing-assistant"><label>Radio de la esquina (mm)<input type="number" min="0" step="any" value={radius} onChange={e=>setRadius(e.target.value)}/></label><p>Un radio mayor crea una curva más amplia. El redondeo se aproxima con una curva Bézier editable. Pulsa una esquina entre dos tramos rectos. Funciona sin margen de costura. Esc vuelve a editar puntos.</p></div>}
  {mode==='round'&&selected&&<div className="drawing-assistant"><p>El redondeado afecta al margen violeta. Primero aplica un ancho y después pulsa la esquina.</p><ActionForm name="quick-margin" title="Aplicar ancho" onError={onError} run={f=>tools.margin(number(f,'width'))}><Numeric name="width" label="Margen de costura (mm)" value={selected.seamWidth??10}/></ActionForm></div>}
  <p className="drawing-hint" aria-live="polite">{hint||'P: colocar puntos · Clic derecho: acciones · Rueda: zoom · Ctrl+Z: deshacer'}</p>
  <div className="canvas-wrap"><canvas ref={ref} tabIndex={0} width={width} height={height} data-mode={mode} data-center-x={tools.viewCenter.x} data-center-y={tools.viewCenter.y} data-zoom={tools.zoom} className={panMode?'pan-canvas':mode==='draw'?'draw-canvas':''} aria-label="Editor del patrón" onPointerDown={down}
    onContextMenu={e=>{e.preventDefault();const b=e.currentTarget.getBoundingClientRect();setMenu({x:Math.max(8,Math.min(e.clientX,window.innerWidth-250)),y:Math.max(8,Math.min(e.clientY,window.innerHeight-190)),world:{x:tools.viewCenter.x+((e.clientX-b.left)*width/b.width-width/2)/tools.zoom,y:tools.viewCenter.y+((e.clientY-b.top)*height/b.height-height/2)/tools.zoom}});}}
    onPointerMove={e=>{if(handleDrag.current){const point=world(e);setGhost({...handleDrag.current,...point});return;}const start=panStart.current;if(!start)return;const b=e.currentTarget.getBoundingClientRect();tools.pan(start.cx-(e.clientX-start.x)*width/b.width/tools.zoom,start.cy-(e.clientY-start.y)*height/b.height/tools.zoom);}}
    onPointerUp={e=>{if(panStart.current){reset();return;}if(handleDrag.current){const point=world(e),h=handleDrag.current;perform(()=>tools.handle(h.index,h.end,point.x,point.y));reset();return;}if(drag.current!==null){const point=world(e),index=drag.current;perform(()=>tools.dragPoint(index,point.x,point.y));}reset();}}
    onPointerCancel={reset} onLostPointerCapture={reset}/>
    <svg className="board-overlay" viewBox="0 0 800 500" aria-hidden="true">{selected?.contour.points.map((p,i)=><text key={p.id} x={(p.x-tools.viewCenter.x)*tools.zoom+408} y={(p.y-tools.viewCenter.y)*tools.zoom+240}>{i+1}</text>)}</svg></div>
  {menu&&<div ref={menuRef} role="menu" aria-label="Acciones del tablero" className="board-menu" style={{left:menu.x,top:menu.y}}><button role="menuitem" disabled={tools.locked} onClick={()=>{add(menu.world);setMenu(null);ref.current?.focus({preventScroll:true});}}>Añadir punto aquí</button><button role="menuitem" disabled={!selected?.contour.segments.length||tools.locked} onClick={()=>{const hit=nearestSegment(menu.world);if(hit)perform(()=>tools.addPoint(hit.index,menu.world.x,menu.world.y));setMenu(null);}}>Insertar punto en el tramo</button><button role="menuitem" onClick={()=>{fit();setMenu(null);}}>Centrar piezas</button><button role="menuitem" onClick={()=>{setMenu(null);ref.current?.focus({preventScroll:true});}}>Cerrar menú · Esc</button></div>}
  </>;
}
