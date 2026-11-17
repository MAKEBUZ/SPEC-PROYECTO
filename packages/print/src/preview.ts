import { initWasm,Resvg } from '@resvg/resvg-wasm';
import { EXPORT_PROFILE,requireProfile } from './profile.js';
import type { RenderAssets } from './profile.js';
import { validateDocument } from '../../document/src/schema.js';
import { revisionId } from '../../document/src/revision.js';
import { segmentControls } from '../../geometry/src/contour-validation.js';
let initialized:Promise<void>|undefined;
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
/** Internal SVG only, never imported SVG. It contains no resources, URLs,
 * scripts, system fonts, clock or random metadata. Preview is NOT production. */
export function previewSvg(input:unknown){
  const document=validateDocument(input),all=document.pieces.flatMap(p=>p.contour.segments.flatMap(s=>segmentControls(p.contour,s.id)));
  let scale=0;for(const p of all)scale=Math.max(scale,Math.abs(p.x),Math.abs(p.y));
  if(scale===0)scale=1;
  let minX=0,maxX=0,minY=0,maxY=0;if(all.length){minX=maxX=all[0]!.x/scale;minY=maxY=all[0]!.y/scale;}
  for(const p of all){minX=Math.min(minX,p.x/scale);maxX=Math.max(maxX,p.x/scale);minY=Math.min(minY,p.y/scale);maxY=Math.max(maxY,p.y/scale);}
  const span=Math.max(maxX-minX,maxY-minY),factor=span>0?660/span:1;
  const point=(p:{x:number;y:number})=>`${32+(p.x/scale-minX)*factor},${48+(p.y/scale-minY)*factor}`;
  const paths=document.pieces.map((p,i)=>{
    const d=p.contour.segments.map(s=>{const c=segmentControls(p.contour,s.id);return s.kind==='line'?`M${point(c[0]!)} L${point(c[1]!)}`:`M${point(c[0]!)} C${point(c[1]!)} ${point(c[2]!)} ${point(c[3]!)}`;}).join(' ');
    // Text is escaped and placed in a separate legend, not interpreted as SVG.
    return `<path d="${d}" fill="none" stroke="#075985" stroke-width="1.5"/><text x="740" y="${64+i*20}" font-size="12">${xml(p.name||`Pieza ${i+1}`)} · ${xml(p.sizeLabel)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768"><rect width="1024" height="768" fill="white"/><g font-family="Noto Sans"><text x="24" y="24" font-size="14">Vista previa — no usar para producción</text>${paths}</g></svg>`;
}
export async function renderPreview(input:unknown,assets:RenderAssets,profileId:string=EXPORT_PROFILE.id){
  const profile=requireProfile(profileId,assets),document=validateDocument(input);
  initialized??=initWasm(Uint8Array.from(assets.wasm));await initialized;
  const renderer=new Resvg(previewSvg(document),{dpi:profile.dpi,languages:['es'],font:{fontBuffers:[Uint8Array.from(assets.font)],defaultFontFamily:profile.fontFamily},shapeRendering:2,textRendering:2,background:'#ffffff'});
  try{const image=renderer.render();try{return {bytes:Uint8Array.from(image.asPng()),exportProfileId:profile.id,revisionId:revisionId(document),width:image.width,height:image.height};}finally{image.free();}}finally{renderer.free();}
}

