import {it,expect} from 'vitest';
import {DocumentCommands} from '../../packages/document/src/commands.js';
import {validateProduction} from '../../packages/print/src/validate.js';
import {pdfFixture} from '../support/pdf-fixture.js';
import {readFile} from 'node:fs/promises';
import {revisionId} from '../../packages/document/src/revision.js';
import {createPrintPdf} from '../../packages/print/src/pdf.js';
import {verifyPrintPdf} from '../../packages/print/src/verify.js';

it.each([null,3])('validates a rounded piece for production with margin %s',margin=>{
 const {document,preparation}=pdfFixture();document.pieces[0]!.seamWidth=margin;
 const commands=new DocumentCommands(document),piece=document.pieces[0]!;
 commands.execute({type:'roundPieceCorner',pieceId:piece.id,pointId:piece.contour.points[0]!.id,radius:10});
 const result=validateProduction(commands.snapshot(),preparation.id);
 expect(result.issues).toEqual([]);expect(result.status).toBe('valid');
},30000);
it('exports and verifies the rounded base and seam in a PDF',async()=>{
 const {document,preparation}=pdfFixture();document.pieces[0]!.seamWidth=3;
 const commands=new DocumentCommands(document),piece=document.pieces[0]!;
 commands.execute({type:'roundPieceCorner',pieceId:piece.id,pointId:piece.contour.points[0]!.id,radius:10});
 const saved=commands.snapshot();saved.revisionId=revisionId(saved);
 const pdf=await createPrintPdf(saved,preparation.id,{font:await readFile('.local/assets/NotoSans-Regular.ttf')});
 await verifyPrintPdf(pdf.bytes,saved,preparation.id);
 expect(pdf.bytes.length).toBeGreaterThan(1000);
},30000);
it('validates a large-radius fillet with a seam',()=>{
 const {document,preparation}=pdfFixture('large','A4',1000);
 const commands=new DocumentCommands(document),piece=document.pieces[0]!;
 commands.execute({type:'roundPieceCorner',pieceId:piece.id,pointId:piece.contour.points[0]!.id,radius:100});
 expect(commands.snapshot().pieces[0]!.contour.segments.filter(s=>s.kind==='cubic').length).toBe(1);
 expect(validateProduction(commands.snapshot(),preparation.id).status).toBe('valid');
},30000);
