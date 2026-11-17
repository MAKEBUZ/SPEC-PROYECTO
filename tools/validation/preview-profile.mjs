import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { renderPreview } from '../../dist/packages/print/src/preview.js';
import { previewCorpus } from '../../dist/tests/print/preview-corpus.js';
const assets={wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')};
const hashes=[];
for(const {name,document} of previewCorpus()){
  const first=await renderPreview(document,assets),second=await renderPreview(document,assets);
  if(!Buffer.from(first.bytes).equals(Buffer.from(second.bytes)))throw Error(`Non-deterministic preview: ${name}`);
  hashes.push({name,bytes:first.bytes.length,sha256:createHash('sha256').update(first.bytes).digest('hex')});
}
console.log(JSON.stringify({profile:'patronaje-preview-1',node:process.version,hashes}));
