import { it,expect } from 'vitest';
import { validateLocalPath } from '../../apps/desktop/src/main/documents/windows-adapter.js';
it.each(['relative.patron','C:relative.patron','\\\\server\\share\\a.patron','\\\\?\\C:\\a.patron','C:\\a.patron:stream','C:\\NUL.patron','C:\\folder.\\a.patron','C:\\..\\a.patron','C:\\a\0.patron'])('rejects ambiguous or unsupported path %s',path=>{
 expect(()=>validateLocalPath(path)).toThrow('ACCESS_DENIED');
});
it('rejects sync descendants but not a folder with a similar name',()=>{
 expect(()=>validateLocalPath('C:\\OneDrive\\patrón.patron',['C:\\OneDrive'])).toThrow();
 expect(validateLocalPath('C:\\OneDrive-local\\patrón.patron',['C:\\OneDrive'])).toBe('C:\\OneDrive-local\\patrón.patron');
});
