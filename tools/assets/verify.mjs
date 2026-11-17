import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, relative, isAbsolute } from 'node:path';

const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
const prepare = process.argv.includes('--prepare');
for (const asset of manifest.assets) {
  const path = resolve(asset.path);
  const rel = relative(process.cwd(), path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Ruta de activo fuera del repositorio.');
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (!prepare || !asset.url || error.code !== 'ENOENT') throw new Error(`Falta el activo ${asset.path}; ejecuta npm run assets:prepare después de npm ci.`);
    const url = new URL(asset.url);
    if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com') throw new Error('Origen no autorizado.');
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Descarga fallida: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Integridad incorrecta: ${asset.path}. No se sustituye automáticamente.`);
  if (prepare && asset.url) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = path + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, path);
  }
  console.log(`Verificado: ${asset.path} (${asset.bytes} bytes)`);
}
