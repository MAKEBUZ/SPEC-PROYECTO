'use client';
import {useEffect,useState} from 'react';
import {TrashPanel} from '../../../../../packages/account-ui/src/trash-panel.js';
import {browserAccountClient} from '../../auth/account-client.js';
import {OperationsPanel} from '../../components/operations-panel.js';
import type {AccountClient} from '../../../../../packages/account-ui/src/client.js';
export default function TrashPage(){const [client,setClient]=useState<AccountClient>(),[error,setError]=useState('');useEffect(()=>{try{setClient(browserAccountClient());}catch{setError('No se pudo abrir el seguimiento local. No se enviarán cambios.');}},[]);return <main className="library"><nav><a href="/account">Cuenta</a> · <a href="/library">Biblioteca</a></nav>{client?<><TrashPanel client={client}/><OperationsPanel client={client}/></>:<p role="status">{error||'Cargando…'}</p>}</main>;}
