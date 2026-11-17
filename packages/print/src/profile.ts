import { createHash } from 'node:crypto';
export const EXPORT_PROFILE=Object.freeze({
  id:'patronaje-preview-1',renderer:'resvg-wasm-2.6.2',width:1024,height:768,
  wasmSha256:'22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70',
  fontSha256:'b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5',
  fontFamily:'Noto Sans',dpi:96,
});
export interface RenderAssets {wasm:Uint8Array;font:Uint8Array}
export function requireProfile(id:string,assets:RenderAssets){
  if(id!==EXPORT_PROFILE.id)throw new Error('EXPORT_PROFILE_UNSUPPORTED');
  const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
  if(hash(assets.wasm)!==EXPORT_PROFILE.wasmSha256||hash(assets.font)!==EXPORT_PROFILE.fontSha256)throw new Error('EXPORT_PROFILE_ASSET_MISMATCH');
  return EXPORT_PROFILE;
}
