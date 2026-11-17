import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createPrintPdf,PDF_PROFILE} from '../../dist/packages/print/src/pdf.js';
const input='.local/validation/pdf-platform-input.json',image='node:24.22.3-bookworm-slim';
function command(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,windowsHide:true});if(r.error||r.status!==0)throw Error(r.error?.message??r.stderr);return r.stdout.trim();}
async function render(verify){
 const fixtures=JSON.parse(await readFile(input,'utf8')),font=await readFile('.local/assets/NotoSans-Regular.ttf'),cases=[];
 for(const {name,document,preparation} of fixtures){
  const a=await createPrintPdf(document,preparation.id,{font}),b=await createPrintPdf(document,preparation.id,{font});
  if(!Buffer.from(a.bytes).equals(Buffer.from(b.bytes)))throw Error('PDF_NONDETERMINISTIC:'+name);
  if(verify){const {verifyPrintPdf}=await import('../../dist/packages/print/src/verify.js');await verifyPrintPdf(a.bytes,document,preparation.id);}
  cases.push({name,sha256:createHash('sha256').update(a.bytes).digest('hex'),bytes:a.bytes.length,measurement:a.measurement});
 }
 return {profile:PDF_PROFILE.id,node:process.version,cases};
}
if(process.argv.includes('--child'))console.log(JSON.stringify(await render(false)));
else{
 const {pdfFixture}=await import('../../dist/tests/support/pdf-fixture.js');
 const {printBoundaryDocument}=await import('../../dist/tests/support/performance-corpus.js');
 const {revisionId}=await import('../../dist/packages/document/src/revision.js');
 const curved=pdfFixture(),piece=curved.document.pieces[0];piece.contour.segments[0]={...piece.contour.segments[0],kind:'cubic',handleStart:{x:25,y:-20},handleEnd:{x:75,y:-20}};piece.seamWidth=0;curved.preparation.transforms[piece.id].rotation=90;curved.document.revisionId=revisionId(curved.document);
 const fixtures=[{name:'large',...pdfFixture()},{name:'a4',...pdfFixture('tiled','A4',400)},{name:'letter',...pdfFixture('tiled','Letter',400)},{name:'rotated-cubic',...curved},{name:'maximum-format',...printBoundaryDocument('maximum-format')}];
 await mkdir('.local/validation',{recursive:true});await writeFile(input,JSON.stringify(fixtures));
 const windows=await render(true),imageId=command('docker',['image','inspect',image,'--format','{{.Id}}']);
 const mounts=['dist','node_modules','.local/assets','tools/validation/pdf-platforms.mjs','package.json',input].flatMap(path=>['--mount',`type=bind,source=${resolve(path)},target=/work/${path},readonly`]);
 const linux=JSON.parse(command('docker',['run','--rm','--network','none','--read-only',...mounts,'--workdir','/work',image,'node','tools/validation/pdf-platforms.mjs','--child']));
 if(JSON.stringify(windows)!==JSON.stringify(linux))throw Error('PDF_PLATFORM_MISMATCH');
 await writeFile('.local/validation/pdf-platforms.json',JSON.stringify({image,imageId,windows,linux,independentVerification:'Windows; identical Linux bytes'},null,2));
 console.log(JSON.stringify({cases:windows.cases.length,identical:true,profile:windows.profile}));
}
