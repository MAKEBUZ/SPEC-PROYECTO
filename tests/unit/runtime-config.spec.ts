import {describe,it,expect} from 'vitest';
import {runtimeConfig} from '../../apps/api/src/runtime/config.js';
const valid={PUBLIC_ORIGIN:'https://patronaje.example.com',AWS_REGION:'us-east-2',AWS_ACCOUNT_ID:'847205414980',DATABASE_URL:'postgresql://u:p@postgres/db',BLOB_BUCKET:'files',BACKUP_BUCKET:'backups',MAIL_SENDER:'patronaje277353@gmail.com',OPERATION_HMAC_KEY:'1'.repeat(64),OUTBOX_KEY:'2'.repeat(64),KEY_VERSION:'v1',STATE_DIRECTORY:'/state',PASSWORD_INDEX_ROOT:'/assets/index',ASSETS_DIRECTORY:'/assets'};
describe('pilot runtime configuration',()=>{
 it('accepts persistent operator supplied keys and Ohio',()=>{expect(runtimeConfig(valid)).toMatchObject({region:'us-east-2',port:3001,keyVersion:'v1'});});
 it('refuses placeholder secrets, HTTP, other regions and invalid ports',()=>{
  for(const patch of [{OUTBOX_KEY:'CHANGE_ME'},{PUBLIC_ORIGIN:'http://example.com'},{PUBLIC_ORIGIN:'https://example.com/path'},{AWS_REGION:'us-east-1'},{PORT:'0'}])expect(()=>runtimeConfig({...valid,...patch})).toThrow();
 });
});
