'use client';
import { useEffect,useState } from 'react';
import {attachWebOperations} from '../operations/lifecycle.js';
import { browserAccountClient } from '../auth/account-client.js';
import { watchDeletionChecks } from '../../../../packages/account-ui/src/deletion-watch.js';
export function DeletionLifecycle(){
  const [notice,setNotice]=useState<string|null>(null);
  useEffect(()=>{try{return attachWebOperations(setNotice);}catch{setNotice('No se pudo abrir el mantenimiento local. Puede continuar trabajando.');}},[]);
  useEffect(()=>{
    try{const watch=watchDeletionChecks(browserAccountClient(),()=>{});return ()=>watch.dispose();}
    catch{/* An unavailable local registry must not trigger anonymous guesses or cleanup. */}
  },[]);
  return notice?<p role="status">{notice}</p>:null;
}
