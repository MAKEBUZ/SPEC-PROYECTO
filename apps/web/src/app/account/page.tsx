'use client';
import { useEffect, useState } from 'react';
import { AccountPanel } from '../../../../../packages/account-ui/src/account-panel.js';
import type { AccountClient } from '../../../../../packages/account-ui/src/client.js';
import { browserAccountClient } from '../../auth/account-client.js';
import {OperationsPanel} from '../../components/operations-panel.js';
export default function AccountPage() {
  const [client, setClient] = useState<AccountClient>(), [error, setError] = useState('');
  useEffect(() => { try { setClient(browserAccountClient()); } catch { setError('No se pudo abrir el registro local de cuenta. No se enviarán cambios.'); } }, []);
  return client ? <><AccountPanel client={client} guided /><details className="account-activity"><summary>Actividad en este dispositivo <span>Publicaciones y cambios pendientes o resueltos</span></summary><OperationsPanel client={client}/></details></> : <main className="account"><h1>Mi cuenta</h1><p role="status">{error || 'Preparando tu espacio…'}</p></main>;
}
