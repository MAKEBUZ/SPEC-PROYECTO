import {it,expect} from 'vitest';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createCanvas} from '@napi-rs/canvas';
import {randomUUID as id} from 'node:crypto';
import {createPiece} from '../../packages/document/src/piece.js';
import {revisionId} from '../../packages/document/src/revision.js';
import {createPrintPdf} from '../../packages/print/src/pdf.js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {verifyPrintPdf} from '../../packages/print/src/verify.js';
import {pdfFixture} from '../support/pdf-fixture.js';
const font=()=>readFile('.local/assets/NotoSans-Regular.ttf');
it.each(['A4','Letter'] as const)('keeps piece labels clear of alignment crosses on %s',async paper=>{
 const {document,preparation}=pdfFixture('tiled',paper);
 document.pieces[0]!.name='Prueba A';document.pieces[0]!.seamWidth=1;
 document.revisionId=revisionId(document);
 const generated=await createPrintPdf(document,preparation.id,{font:await font()});
 await verifyPrintPdf(generated.bytes,document,preparation.id);
 const task=getDocument({data:Uint8Array.from(generated.bytes),useSystemFonts:false});
 try{
  const pdf=await task.promise,page=await pdf.getPage(3),height=page.getViewport({scale:1}).height;
  const items=(await page.getTextContent()).items.filter(item=>'str' in item&&/Prueba A|Corte al doblez/.test(item.str));
  expect(items).toHaveLength(2);
  for(const item of items){if(!('str' in item))continue;
   const left=item.transform[4]*25.4/72,right=left+item.width*25.4/72;
   const top=(height-item.transform[5]-item.height)*25.4/72,bottom=(height-item.transform[5])*25.4/72;
   // Top-left cross spans x/y 13..17 mm; check actual PDF text bounds.
   expect(right<=12||left>=18||bottom<=12||top>=18).toBe(true);
  }
 }finally{await task.destroy();}
},30000);
it('verifies a rotated cubic contour over its complete path',async()=>{
 const {document,preparation}=pdfFixture(),piece=document.pieces[0]!;
 const first=piece.contour.segments[0]!;piece.contour.segments[0]={...first,kind:'cubic',handleStart:{x:25,y:-20},handleEnd:{x:75,y:-20}};
 piece.seamWidth=0;preparation.transforms[piece.id]!.rotation=90;document.revisionId=revisionId(document);
 const pdf=await createPrintPdf(document,preparation.id,{font:await font()});
 expect((await verifyPrintPdf(pdf.bytes,document,preparation.id)).scale).toBe(1);
},30000);
it.each(['large','tiled'] as const)('creates a deterministic vector PDF in %s mode, preserving the saved document',async mode=>{
 const {document,preparation}=pdfFixture(mode),before=structuredClone(document),assets={font:await font()};
 const a=await createPrintPdf(document,preparation.id,assets),b=await createPrintPdf(document,preparation.id,assets);
 expect(a.bytes).toEqual(b.bytes);expect(document).toEqual(before);expect(a.measurement.scale).toBe(1);
 const measured=await verifyPrintPdf(a.bytes,document,preparation.id);expect(measured.pages.length).toBe(a.measurement.pages.length);
 const task=getDocument({data:Uint8Array.from(a.bytes),useSystemFonts:false});const pdf=await task.promise;
 try{
  expect(pdf.numPages).toBe(mode==='large'?1:3);const page=await pdf.getPage(1),view=page.getViewport({scale:1});
  expect(view.width*25.4/72).toBeCloseTo(a.measurement.pages[0]!.widthMm,4);
  const text=(await page.getTextContent()).items.filter(x=>'str'in x).map(x=>x.str).join(' ');
  expect(text).toContain('100');expect(text).toContain('1:1');
 }finally{await task.destroy();}
},30000);
it('rejects unsaved and invalid selected geometry before producing a PDF',async()=>{
 const {document,preparation}=pdfFixture(),assets={font:await font()};document.pieces[0]!.name='Cambio';
 await expect(createPrintPdf(document,preparation.id,assets)).rejects.toThrow('SAVED_REVISION_MISMATCH');
 document.pieces[0]!.name='';document.revisionId=revisionId(document);
 await expect(createPrintPdf(document,preparation.id,assets)).rejects.toThrow('PRODUCTION_INVALID');
});
it.each(['A4','Letter'] as const)('keeps tiled pages at real size on %s and rejects modified graphics',async paper=>{
 const {document,preparation}=pdfFixture('tiled',paper,300),pdf=await createPrintPdf(document,preparation.id,{font:await font()});
 const measured=await verifyPrintPdf(pdf.bytes,document,preparation.id);expect(measured.pages.length).toBeGreaterThan(3);
 const original=Buffer.from(pdf.bytes).toString('latin1');
 for(const corrupted of [original.replace('2.834646 0 0 2.834646','2.734646 0 0 2.834646'),original.replaceAll('\nS\n','\nn\n'),original.replace('[2 1] 0 d','[1 1] 0 d')]){
  expect(corrupted).not.toBe(original);await expect(verifyPrintPdf(Buffer.from(corrupted,'latin1'),document,preparation.id)).rejects.toThrow();
 }
 await expect(verifyPrintPdf(pdf.bytes.subarray(0,pdf.bytes.length-20),document,preparation.id)).rejects.toThrow('PDF_INCOMPLETE');
},30000);
it('uses UserUnit for a 5 metre piece without changing physical scale',async()=>{
 const {document,preparation}=pdfFixture('large','A4',4980),pdf=await createPrintPdf(document,preparation.id,{font:await font()});
 const measured=await verifyPrintPdf(pdf.bytes,document,preparation.id);expect(measured.pages[0]!.widthMm).toBeCloseTo(5020,3);
},30000);
it('renders the generated page for visual inspection',async()=>{
 const {document,preparation}=pdfFixture(),pdf=await createPrintPdf(document,preparation.id,{font:await font()}),task=getDocument({data:Uint8Array.from(pdf.bytes),useSystemFonts:false});
 try{const decoded=await task.promise,page=await decoded.getPage(1),viewport=page.getViewport({scale:1}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  await page.render({canvas:canvas as unknown as HTMLCanvasElement,viewport}).promise;
  await mkdir('.local/validation',{recursive:true});await writeFile('.local/validation/print-preview.png',await canvas.encode('png'));await writeFile('.local/validation/print-preview.pdf',pdf.bytes);
 }finally{await task.destroy();}
},30000);
it('ignores an invalid unselected draft and generates the inclusive 250-page maximum',async()=>{
 const {document,preparation}=pdfFixture('tiled','A4',2774),second=pdfFixture('tiled','A4',2774).document.pieces[0]!;
 for(const piece of [document.pieces[0]!,second])for(const point of piece.contour.points)if(point.y>0)point.y=2126;
 document.pieces.push(second);preparation.selection.push(second.id);preparation.transforms[second.id]={x:2796,y:0,rotation:0};
 const invalid=pdfFixture().document.pieces[0]!;invalid.name='';invalid.contour.segments.pop();document.pieces.push(invalid);document.revisionId=revisionId(document);
 const generated=await createPrintPdf(document,preparation.id,{font:await font()});expect(generated.measurement.pages).toHaveLength(250);
 expect((await verifyPrintPdf(generated.bytes,document,preparation.id)).pages).toHaveLength(250);
 preparation.transforms[second.id]!.x+=.001;document.revisionId=revisionId(document);
 await expect(createPrintPdf(document,preparation.id,{font:await font()})).rejects.toThrow('PRODUCTION_INVALID');
},60000);


