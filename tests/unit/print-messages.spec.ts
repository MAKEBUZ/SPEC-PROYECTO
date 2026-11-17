import {it,expect} from 'vitest';
import {productionMessage} from '../../packages/print/src/issue-message.js';
import {userMessage} from '../../apps/desktop/src/renderer/messages.js';
it('explains distinct missing fields instead of repeating metadata codes',()=>{
 const text=userMessage('PRODUCTION_INVALID: '+productionMessage([{code:'METADATA_REQUIRED',detail:'name'},{code:'METADATA_REQUIRED',detail:'grainline'},{code:'METADATA_REQUIRED',detail:'grainline'},{code:'CONTOUR_INVALID'}]));
 expect(text).toContain('Falta el nombre');expect(text).toContain('inicio y fin distintos');expect(text).toContain('cerrado');
 expect(text).not.toContain('METADATA_REQUIRED');expect(text.match(/inicio y fin distintos/g)).toHaveLength(1);
});
