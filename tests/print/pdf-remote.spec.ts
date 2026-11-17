import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {pdfFixture} from '../support/pdf-fixture.js';
import {createPrintPdf,PDF_PROFILE} from '../../packages/print/src/pdf.js';
import {savedPdfOrigin} from '../../packages/document/src/pdf-artifact.js';
import {revisionId} from '../../packages/document/src/revision.js';
import {verifyUploadedPdf} from '../../apps/api/src/publications/pdf-verifier.js';
it('regenerates and independently verifies a PDF of the exact editable revision',async()=>{
 const {document,preparation}=pdfFixture(),assets={font:await readFile('.local/assets/NotoSans-Regular.ttf')};
 const generated=await createPrintPdf(document,preparation.id,assets),pdf={bytes:generated.bytes,profileId:PDF_PROFILE.id,...savedPdfOrigin(document,preparation.id)};
 expect((await verifyUploadedPdf(document,pdf,assets)).scale).toBe(1);
 await expect(verifyUploadedPdf(document,{...pdf,profileId:'unknown'},assets)).rejects.toThrow('EXPORT_PROFILE_UNSUPPORTED');
 await expect(verifyUploadedPdf(document,{...pdf,preparationHash:'0'.repeat(64)},assets)).rejects.toThrow('ARTIFACT_MISMATCH');
 const changed=structuredClone(document);changed.pieces[0]!.name='Otra revisión';changed.revisionId=revisionId(changed);
 await expect(verifyUploadedPdf(changed,pdf,assets)).rejects.toThrow('ARTIFACT_MISMATCH');
 // Even semantically harmless metadata edits are outside the deterministic profile.
 const altered=Buffer.from(pdf.bytes).toString('latin1').replace('20000101','20010101');
 expect(altered).not.toBe(Buffer.from(pdf.bytes).toString('latin1'));
 await expect(verifyUploadedPdf(document,{...pdf,bytes:Buffer.from(altered,'latin1')},assets)).rejects.toThrow('ARTIFACT_MISMATCH');
});
