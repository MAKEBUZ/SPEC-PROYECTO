import { AccountPanel } from '../../../../../packages/account-ui/src/account-panel.js';
import { AccountClient } from '../../../../../packages/account-ui/src/client.js';
import {OperationsPanel} from '../operations/operations-panel.js';
import {DesktopTrashPanel} from './trash-panel.js';
import {useState} from 'react';
import type { Reply } from '../../../../../packages/account-ui/src/client.js';
declare global { interface Window { patron: { onCloseRequested(listener:(token:string)=>void):()=>void;request(value: Record<string, unknown>): Promise<{ status: string; data: unknown; error?: { message: string } }> } } }
async function call(action: string, body?: unknown) {
  const reply = await window.patron.request({ requestId: crypto.randomUUID(), method: 'account.action', action, body: body ?? null });
  if (reply.status !== 'success') throw new Error(reply.error?.message ?? 'No se pudo completar la operación.');
  return reply.data as Reply;
}
// Only non-secret operation identities are retained here. Main validates every
// action and stores credentials using Windows protection.
export const desktopAccountClient = () => new AccountClient({durableAdmission:true, request: call }, {
  load: () => JSON.parse(localStorage.getItem('patron.account-pending') ?? '[]'),
  save: value => localStorage.setItem('patron.account-pending', JSON.stringify(value)),
});
export function DesktopAccountPanel({ client }: { client: AccountClient }) {const [open,setOpen]=useState(false);return <div className="account-workspace"><AccountPanel client={client} desktop /><details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Proyectos y papelera de la cuenta</summary>{open&&<DesktopTrashPanel client={client}/>}</details><details><summary>Actividad y operaciones</summary><p>Consulta los envíos pendientes y sus resultados. Cerrar este panel no cancela su seguimiento.</p><OperationsPanel client={client}/></details></div>; }
