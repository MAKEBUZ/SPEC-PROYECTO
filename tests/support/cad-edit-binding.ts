import { _electron } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CadEditDriver,EditorSnapshot } from './cad-edit-driver.js';
export async function openCadEditor():Promise<CadEditDriver>{
  const env=Object.fromEntries(Object.entries(process.env).filter((pair):pair is [string,string]=>pair[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  const dir=await mkdtemp(join(tmpdir(),'patron-cad-'));
  const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${dir}`],env});
  const page=await app.firstWindow();await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
  await page.getByRole('heading',{name:'Patronaje · CAD'}).waitFor();
  const snapshot=async()=>JSON.parse((await page.getByTestId('cad-snapshot').textContent())!) as EditorSnapshot;
  const form=async(name:string,values:Record<string,string|boolean>)=>{
    const f=page.locator(`form[data-action="${name}"]`);
    const group=f.locator("xpath=ancestor::details");if(await group.count()&&!await group.evaluate(e=>e.hasAttribute("open")))await group.locator(":scope > summary").click();
    for(const [key,value] of Object.entries(values)){const input=f.locator(`[name="${key}"]`);if(typeof value==='boolean')await input.setChecked(value);else if(await input.evaluate(e=>e.tagName==='SELECT'))await input.selectOption(value);else await input.fill(value);}
    await f.getByRole('button').click();const error=await page.getByTestId('cad-error').textContent();if(error)throw new Error(error);
  };
  const button=async(name:string)=>{const b=page.getByRole('button',{name,exact:true});if(await b.isEnabled())await b.click();};
  return {
    create:()=>button('Nuevo documento'),
    draw:async(vertices,kinds=[])=>{const before=await snapshot();await form('draw',{vertices:vertices.map(([x,y],i)=>`${x},${y}${kinds[i]==='cubic'?',curva':''}`).join('\n')});return (await snapshot()).pieces.find(p=>!before.pieces.some(v=>v.id===p.id))!.id;},
    select:async id=>{await page.getByLabel('Pieza',{exact:true}).selectOption(id);},
    point:(index,x,y)=>form('point',{index:String(index),x:String(x),y:String(y)}),
    shiftPoint:(index,dx,dy)=>form('shiftPoint',{index:String(index),dx:String(dx),dy:String(dy)}),
    addPoint:(after,x,y)=>form('insert',{after:String(after),x:String(x),y:String(y)}),
    removePoint:async index=>{page.once('dialog',d=>void d.accept());await form('removePoint',{index:String(index)});},
    handle:(segment,end,x,y)=>form('handle',{segment:String(segment),end,x:String(x),y:String(y)}),
    closeContour:()=>button('Cerrar contorno'),
    grid:(spacing,snapGrid,snapEndpoints)=>form('grid',{spacing:String(spacing),snapGrid,snapEndpoints}),
    dragPoint:async(index,x,y)=>{const p=(await snapshot()).pieces[0]!.contour.points[index]!,canvas=page.getByLabel('Editor del patrón');await canvas.scrollIntoViewIfNeeded();const b=(await canvas.boundingBox())!,cx=Number(await canvas.getAttribute('data-center-x')),cy=Number(await canvas.getAttribute('data-center-y')),z=Number(await canvas.getAttribute('data-zoom'));await page.mouse.move(b.x+((p.x-cx)*z+400)*b.width/800,b.y+((p.y-cy)*z+250)*b.height/500);await page.mouse.down();await page.mouse.move(b.x+((x-cx)*z+400)*b.width/800,b.y+((y-cy)*z+250)*b.height/500);await canvas.dispatchEvent('pointerup',{clientX:b.x+((x-cx)*z+400)*b.width/800,clientY:b.y+((y-cy)*z+250)*b.height/500,pointerId:1});await page.mouse.up();},
    move:(dx,dy)=>form('move',{dx:String(dx),dy:String(dy)}),
    rotate:(degrees,cx,cy)=>form('rotate',{degrees:String(degrees),cx:String(cx),cy:String(cy)}),
    reflect:(a,b)=>form('reflect',{x1:String(a[0]),y1:String(a[1]),x2:String(b[0]),y2:String(b[1])}),
    duplicate:async()=>{const before=await snapshot();await button('Duplicar pieza');return (await snapshot()).pieces.find(p=>!before.pieces.some(v=>v.id===p.id))!.id;},
    deletePiece:async confirm=>{page.once('dialog',d=>void(confirm?d.accept():d.dismiss()));await button('Eliminar pieza');},
    margin:width=>form('margin',{width:width===null?'':String(width)}),
    corner:(pointId,join)=>form('corner',{pointId,join}),
    properties:p=>form('properties',{name:p.name,sizeLabel:p.sizeLabel,cutQuantity:p.cutQuantity===null?'':String(p.cutQuantity),fold:p.fold,grainline:!!p.grainline,gx1:String(p.grainline?.start.x??0),gy1:String(p.grainline?.start.y??0),gx2:String(p.grainline?.end.x??0),gy2:String(p.grainline?.end.y??0)}),
    view:(unit,zoom)=>form('view',{unit,zoom:String(zoom)}),undo:()=>button('Deshacer'),redo:()=>button('Rehacer'),snapshot,close:async()=>{await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();},
  };
}

