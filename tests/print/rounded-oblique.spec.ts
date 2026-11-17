import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pdfFixture} from '../support/pdf-fixture.js';
import type {Segment,Coordinate} from '../../packages/geometry/src/model.js';
import {revisionId} from '../../packages/document/src/revision.js';
import {createPrintPdf} from '../../packages/print/src/pdf.js';
import {verifyPrintPdf} from '../../packages/print/src/verify.js';

it('exports an oblique rounded corner, curved hem and 10 mm seam without stalling',async()=>{
 const shape=JSON.parse(await readFile('tests/support/rounded-oblique.json','utf8')) as {points:[number,number][];segments:{kind:'line'|'cubic';start:number;end:number;handleStart?:Coordinate;handleEnd?:Coordinate}[]};
 const {document,preparation}=pdfFixture('tiled');const piece=document.pieces[0]!;
 const points=shape.points.map(([x,y])=>({id:randomUUID(),x,y}));
 const segments:Segment[]=shape.segments.map(s=>{const base={id:randomUUID(),startId:points[s.start]!.id,endId:points[s.end]!.id};return s.kind==='line'?{...base,kind:'line'}:{...base,kind:'cubic',handleStart:s.handleStart!,handleEnd:s.handleEnd!};});
 piece.contour={points,segments};piece.cornerJoins=Object.fromEntries(points.map(p=>[p.id,'miter']));
 document.revisionId=revisionId(document);
 const started=performance.now(),pdf=await createPrintPdf(document,preparation.id,{font:await readFile('.local/assets/NotoSans-Regular.ttf')});
 await verifyPrintPdf(pdf.bytes,document,preparation.id);
 expect(pdf.bytes.length).toBeGreaterThan(1000);
 console.info('Rounded oblique PDF, generation and verification (ms):',Math.round(performance.now()-started));
},180000);
