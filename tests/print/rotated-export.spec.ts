import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pdfFixture} from '../support/pdf-fixture.js';
import {revisionId} from '../../packages/document/src/revision.js';
import {ExportJob} from '../../apps/desktop/src/main/print/export-job.js';
it('generates and independently verifies a non-quadrant cubic within the 60-second target',async()=>{
 const {document,preparation}=pdfFixture(),piece=document.pieces[0]!;
 piece.contour.segments[0]={...piece.contour.segments[0]!,kind:'cubic',handleStart:{x:25,y:-20},handleEnd:{x:75,y:-20}};
 piece.seamWidth=0;preparation.transforms[piece.id]!.rotation=37;document.revisionId=revisionId(document);
 const font=await readFile('.local/assets/NotoSans-Regular.ttf'),started=performance.now(),job=new ExportJob(Buffer.from(JSON.stringify(document)),preparation.id,font,pathToFileURL(resolve('dist/apps/desktop/src/main/print/export-runner.js')));
 // Test watchdog only. The application deliberately has no automatic timeout.
 const watchdog=setTimeout(()=>void job.cancel(),65000);
 try{const result=await job.finished;expect(result).not.toBeNull();expect(result?.measurement.scale).toBe(1);expect(job.progress.state).toBe('verified');expect(performance.now()-started).toBeLessThanOrEqual(60000);}
 finally{clearTimeout(watchdog);await job.cancel();}
},70000);
