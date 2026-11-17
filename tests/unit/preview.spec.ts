import { it,expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderPreview,previewSvg } from '../../packages/print/src/preview.js';
import { createPiece } from '../../packages/document/src/piece.js';
import { polygon } from '../geometry/fixtures.js';
import { previewCorpus } from '../print/preview-corpus.js';
import { createHash } from 'node:crypto';
const document=()=>({formatVersion:1 as const,documentId:'80000000-0000-4000-8000-000000000001',revisionId:'0'.repeat(64),units:'mm' as const,preparations:[],pieces:[createPiece('80000000-0000-4000-8000-000000000002',polygon([[0,0],[40,0],[40,30],[0,30]]))]});
it('renders deterministic PNG bytes with pinned WASM/fonts and ignores transport revision',async()=>{
  const assets={wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')},doc=document();
  const first=await renderPreview(doc,assets);doc.revisionId='a'.repeat(64);const second=await renderPreview(doc,assets);
  expect(second.bytes).toEqual(first.bytes);expect(first).toMatchObject({width:1024,height:768});expect([...first.bytes.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  await expect(renderPreview(doc,assets,'unknown')).rejects.toThrow('EXPORT_PROFILE_UNSUPPORTED');
  await expect(renderPreview(doc,{...assets,font:new Uint8Array([0])})).rejects.toThrow('EXPORT_PROFILE_ASSET_MISMATCH');
});
it('preserves the published profile bytes across the extended corpus',async()=>{
  const golden=JSON.parse(await readFile('tests/print/preview-profile-1.json','utf8')) as {hashes:{name:string;bytes:number;sha256:string}[]};
  const assets={wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')};
  for(const {name,document:doc} of previewCorpus()){
    const before=structuredClone(doc),render=await renderPreview(doc,assets);
    expect({name,bytes:render.bytes.length,sha256:createHash('sha256').update(render.bytes).digest('hex')}).toEqual(golden.hashes.find(h=>h.name===name));
    expect(doc).toEqual(before);expect(render.exportProfileId).toBe('patronaje-preview-1');
  }
});
it('escapes labels instead of loading active or external SVG content',()=>{
  const doc=document();doc.pieces[0]!.name='<script src="https://example.invalid"/>';
  const svg=previewSvg(doc);expect(svg).not.toContain('<script');expect(svg).not.toContain('href=');expect(svg).toContain('&lt;script');
});
