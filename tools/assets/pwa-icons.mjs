import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { initWasm,Resvg } from '@resvg/resvg-wasm';
await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
await mkdir('apps/web/public/icons',{recursive:true});
for(const [name,size] of [['icon-192',192],['icon-512',512],['maskable-512',512]]){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#075985"/><path d="M170 155 L235 132 Q256 178 277 132 L342 155 L320 235 L320 370 L192 370 L192 235 Z" fill="#ffffff"/><path d="M256 220 L256 330 M244 235 L256 220 L268 235" fill="none" stroke="#075985" stroke-width="10" stroke-linecap="round"/></svg>`;
  const renderer=new Resvg(svg);try{const image=renderer.render();try{await writeFile(`apps/web/public/icons/${name}.png`,image.asPng());}finally{image.free();}}finally{renderer.free();}
}
