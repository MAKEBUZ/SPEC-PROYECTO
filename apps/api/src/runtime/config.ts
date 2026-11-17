export function runtimeConfig(env:Readonly<Record<string,string|undefined>>){
 const required=(name:string)=>{const value=env[name];if(!value||value==='CHANGE_ME')throw Error(`CONFIG_REQUIRED:${name}`);return value;};
 const publicOrigin=required('PUBLIC_ORIGIN'),url=new URL(publicOrigin);
 if(url.protocol!=='https:'||url.origin!==publicOrigin)throw Error('CONFIG_PUBLIC_ORIGIN');
 const key=(name:string)=>{const text=required(name);if(!/^[a-f0-9]{64}$/.test(text))throw Error(`CONFIG_KEY:${name}`);return Buffer.from(text,'hex');};
 const region=required('AWS_REGION');if(region!=='us-east-2')throw Error('CONFIG_REGION');
 const owner=required('AWS_ACCOUNT_ID');if(!/^\d{12}$/.test(owner))throw Error('CONFIG_ACCOUNT');
 const port=Number(env.PORT??3001);if(!Number.isInteger(port)||port<1||port>65535)throw Error('CONFIG_PORT');
 return {publicOrigin,region,owner,port,databaseUrl:required('DATABASE_URL'),blobBucket:required('BLOB_BUCKET'),backupBucket:required('BACKUP_BUCKET'),sender:required('MAIL_SENDER'),operationKey:key('OPERATION_HMAC_KEY'),outboxKey:key('OUTBOX_KEY'),keyVersion:required('KEY_VERSION'),stateDirectory:required('STATE_DIRECTORY'),corpusDirectory:required('PASSWORD_INDEX_ROOT'),assetsDirectory:required('ASSETS_DIRECTORY')};
}
