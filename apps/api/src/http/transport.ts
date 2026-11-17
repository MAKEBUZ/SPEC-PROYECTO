import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';

export const MAX_FILE_BYTES = 100000000;
// Upload handlers must pipe through this before staging. A valid Content-Length
// never replaces counting actual bytes; no overflowing chunk reaches storage.
export class FileSizeLimit extends Transform {
  private received = 0;
  constructor(private readonly maximum = MAX_FILE_BYTES) { super(); }
  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.received += chunk.length;
    if (this.received > this.maximum) callback(new ValidationError('FILE_TOO_LARGE'));
    else callback(null, chunk);
  }
}
