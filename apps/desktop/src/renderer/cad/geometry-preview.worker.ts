import { calculatePreview } from './geometry-preview.js';
import type { Piece } from '../../../../../packages/document/src/piece.js';
self.onmessage=(event:MessageEvent<Piece[]>)=>{
  for(const piece of event.data)self.postMessage(calculatePreview(piece));
};
