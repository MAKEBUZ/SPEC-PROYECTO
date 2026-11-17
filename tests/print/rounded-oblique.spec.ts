import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {roundedObliqueFixture} from '../support/rounded-oblique-fixture.js';
import {createPrintPdf} from '../../packages/print/src/pdf.js';
import {verifyPrintPdf} from '../../packages/print/src/verify.js';

it('exports an oblique rounded corner, curved hem and 10 mm seam without stalling',async()=>{
 const {document,preparation}=await roundedObliqueFixture();
 const started=performance.now(),pdf=await createPrintPdf(document,preparation.id,{font:await readFile('.local/assets/NotoSans-Regular.ttf')});
 await verifyPrintPdf(pdf.bytes,document,preparation.id);
 expect(pdf.bytes.length).toBeGreaterThan(1000);
 console.info('Rounded oblique PDF, generation and verification (ms):',Math.round(performance.now()-started));
},180000);
