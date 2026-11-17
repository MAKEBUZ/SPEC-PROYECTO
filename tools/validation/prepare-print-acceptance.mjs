import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pdfFixture} from '../../dist/tests/support/pdf-fixture.js';
import {createPrintPdf} from '../../dist/packages/print/src/pdf.js';
import {verifyPrintPdf} from '../../dist/packages/print/src/verify.js';
const directory=resolve('.local/validation/physical-print');await mkdir(directory,{recursive:true});
const font=await readFile('.local/assets/NotoSans-Regular.ttf'),artifacts=[];
for(const [name,mode,paper] of [['gran-formato','large','A4'],['mosaico-A4','tiled','A4'],['mosaico-Carta','tiled','Letter']]){
 const {document,preparation}=pdfFixture(mode,paper,300),result=await createPrintPdf(document,preparation.id,{font});
 const file=resolve(directory,name+'.pdf');await writeFile(file,result.bytes);
 const stored=await readFile(file),measurement=await verifyPrintPdf(stored,document,preparation.id);
 await writeFile(resolve(directory,name+'.patron'),JSON.stringify(document));
 artifacts.push({file,sha256:createHash('sha256').update(stored).digest('hex'),measurement,physicalResult:'pending'});
}
await writeFile(resolve(directory,'manifest.json'),JSON.stringify({date:new Date().toISOString(),instructions:'Imprimir al 100%, sin ajustar. Medir cada lado: 99,5 a 100,5 mm. Registrar equipo/papel/controlador. Sin aceptación física inferida.',artifacts},null,2));
console.log(JSON.stringify(artifacts,null,2));
