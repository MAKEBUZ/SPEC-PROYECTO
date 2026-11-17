'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { DTO } from '../../contracts/src/http-dto.js';
import type { HttpDto } from '../../contracts/src/http-dto.js';
import type { AccountAction } from '../../contracts/src/account-actions.js';
import type { AccountClient } from './client.js';
import { watchDeletionChecks } from './deletion-watch.js';

type Field = { name: string; label: string; type?: string; autocomplete?: string; value?: string };
const email: Field = { name: 'email', label: 'Correo electrónico', type: 'email', autocomplete: 'email' };
const password: Field = { name: 'password', label: 'Contraseña', type: 'password', autocomplete: 'current-password' };
const current: Field = { ...password, name: 'currentPassword', label: 'Contraseña actual' };
const next: Field = { ...password, name: 'newPassword', label: 'Contraseña nueva', autocomplete: 'new-password' };
function AccountForm({ title, fields = [], disabled, submit, note }: { title: string; fields?: Field[]; disabled: boolean; submit: (value: Record<string,string>) => Promise<void>; note?: string }) {
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string,string>;
    await submit(values);
    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type=password]'))) input.value = '';
  }
  return <form onSubmit={onSubmit}><h2>{title}</h2>{note && <p>{note}</p>}<fieldset disabled={disabled}>
    {fields.map(field => <label key={field.name}>{field.label}<input key={field.value} defaultValue={field.value} name={field.name} type={field.type ?? 'text'} autoComplete={field.autocomplete ?? 'off'} required /></label>)}
    <button type="submit">{title}</button></fieldset></form>;
}
export function AccountPanel({ client, desktop = false }: { client: AccountClient; desktop?: boolean }) {
  const [accessPage,setAccessPage]=useState('login'),[settingsPage,setSettingsPage]=useState('profile');
  const [session, setSession] = useState<HttpDto<'SessionView'> | null>(null);
  const [profile, setProfile] = useState<HttpDto<'AccountProfile'> | null>(null);
  const [deletion, setDeletion] = useState<HttpDto<'AccountDeletion'> | null>(null);
  const [scope, setScope] = useState<{ scopeRevision: string; resources: { id: string; name?: string }[]; versions: number; files: number; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false), [online, setOnline] = useState(true), [message, setMessage] = useState('');
  const [checks, setChecks] = useState<HttpDto<'DeletionStatus'>[]>([]);
  const [checkMessage,setCheckMessage]=useState('');
  const deletionChecks=useRef<ReturnType<typeof watchDeletionChecks>|null>(null);
  const [localEnabled, setLocalEnabled] = useState(false);
  const [revocationPending, setRevocationPending] = useState(false);
  const [logoutAllPending, setLogoutAllPending] = useState(false);
  const [linkToken, setLinkToken] = useState('');
  const active = session?.accessClass === 'normal', limited = session?.accessClass === 'account_recovery';
  useEffect(()=>client.subscribe(()=>{if(client.accountId===null){setSession(null);setProfile(null);setDeletion(null);setScope(null);}}),[client]);
  async function refresh() {
    const snapshot = await client.query('snapshot') as { session: unknown; localEnabled?: boolean; revocationPending?: boolean; logoutAllPending?: boolean };
    const view = snapshot.session ? DTO.SessionView.parse(snapshot.session) : null;
    setSession(view); client.accountId = view?.accountId ?? null; setLocalEnabled(!!snapshot.localEnabled);
    setRevocationPending(!!snapshot.revocationPending); setLogoutAllPending(!!snapshot.logoutAllPending);
    setProfile(null); setDeletion(null); setScope(null);
    if (view?.accessClass === 'normal') setProfile(DTO.AccountProfile.parse(await client.query('profile')));
    if (view?.accessClass === 'account_recovery') setDeletion(DTO.AccountDeletion.parse(await client.query('deletion')));
  }
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setMessage('Procesando…');
    try { await action(); } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.'); setScope(null);
      try { const snapshot = await client.query('snapshot') as { session: unknown }; if (!snapshot.session) { setSession(null); setProfile(null); setDeletion(null); setScope(null); client.accountId = null; } } catch { /* Preserve uncertainty. */ }
    }
    finally { setBusy(false); }
  }
  async function mutation(action: AccountAction, fields: Record<string, unknown>) {
    await client.mutate(action, fields); setMessage(action === 'resetRequest' ? 'Si existe una cuenta, recibirás un enlace de recuperación.' : action === 'register' ? 'Cuenta creada. Revisa tu correo; inicia sesión para reenviar la verificación si lo necesitas.' : 'Cambio confirmado.');
    if (['recoverAccount','deleteAccount','resetConfirm','verificationConfirm'].includes(action)) {
      setLinkToken('');
      await client.query('forgetSession'); setSession(null); setProfile(null); setDeletion(null); setScope(null); client.accountId = null;
      setMessage(action === 'deleteAccount' ? 'Eliminación solicitada. Inicia sesión para consultar el plazo o recuperar tu cuenta.' : 'Confirmado. Inicia sesión de nuevo.');
    } else if (active || limited) await refresh();
  }
  useEffect(() => {
    let stopped = false;
    const subscription=watchDeletionChecks(client,state=>{setChecks(state.rows);setCheckMessage(state.failed?'No se pudo comprobar la eliminación. Se reintentará; el resultado sigue desconocido.':state.rows.length?'Estado comprobado.':'');});
    deletionChecks.current=subscription;
    const connected = () => { setOnline(navigator.onLine); };
    const url = new URL(window.location.href), token = url.searchParams.get('token');
    if (token) { setAccessPage('verify');setLinkToken(token); url.searchParams.delete('token'); window.history.replaceState(null, '', url); }
    setOnline(navigator.onLine); void run(async () => { await refresh(); setMessage(''); });
    window.addEventListener('online', connected); window.addEventListener('offline', connected);
    const statusTimer = setInterval(() => {
      void client.query('snapshot').then(value => {
        if (stopped) return;
        const status = value as { session: unknown; revocationPending?: boolean; logoutAllPending?: boolean };
        setRevocationPending(!!status.revocationPending); setLogoutAllPending(!!status.logoutAllPending);
        if (!status.session) { setSession(null); setProfile(null); setDeletion(null); setScope(null); client.accountId = null; }
      }).catch(() => undefined);
    }, 15000);
    return () => { stopped = true; subscription.dispose();if(deletionChecks.current===subscription)deletionChecks.current=null;clearInterval(statusTimer);window.removeEventListener('online', connected); window.removeEventListener('offline', connected); };
  }, [client]);
  const disabled = busy || !online;
  const form = (title: string, action: AccountAction, fields: Field[], note?: string) => <div data-operation-form={action}><AccountForm title={title} fields={fields} disabled={disabled} submit={values => run(() => mutation(action, values))} {...(note ? { note } : {})} /></div>;
  return <main className="account"><header><p>PATRONAJE · {desktop ? 'CAD' : 'Cuenta'}</p><h1>{desktop?'Mi cuenta':'Tu cuenta'}</h1><p>{desktop?'Gestiona tu acceso y tus datos. Tus archivos locales se conservan por separado.':'Gestiona tu perfil, acceso y seguridad.'}</p></header>
    {!online && <p role="status">Sin conexión. Las operaciones de cuenta requieren internet.</p>}
    {desktop && <p>{localEnabled ? 'El trabajo local del CAD permanece habilitado.' : 'Inicia sesión con correo verificado y conexión para habilitar el CAD.'}</p>}
    {revocationPending && <p role="status">Sesión cerrada localmente. Invalidación remota pendiente al recuperar conexión.</p>}
    {logoutAllPending && <p role="status">Cierre de todas las sesiones: resultado pendiente de comprobar. No se repetirá automáticamente.</p>}
    <p role="status" aria-live="polite">{message}</p>
    {desktop&&!session&&<nav className="account-tabs" aria-label="Opciones de acceso">{[['login','Iniciar sesión'],['register','Crear cuenta'],['reset','Recuperar acceso'],['verify','Verificar correo']].map(([id,label])=><button key={id} aria-current={accessPage===id?'page':undefined} onClick={()=>setAccessPage(id!)}>{label}</button>)}</nav>}
    {!session && <>
      {(!desktop||accessPage==='login')&&<AccountForm title="Iniciar sesión" fields={[email,password]} disabled={disabled} submit={values => run(async () => { await client.query('login', values); await refresh(); setSettingsPage('profile');setAccessPage('login');setMessage('Sesión iniciada.'); })} />}
      {(!desktop||accessPage==='register')&&form('Crear cuenta','register',[email,{ ...password, autocomplete: 'new-password' }], 'Debes verificar tu correo antes de acceder a tus proyectos.')}
    </>}
    {session?.accessClass === 'verification' && <><p>Verifica tu correo para acceder a la cuenta.</p>{form('Reenviar verificación','verificationRequest',[])}</>}
    {!active && <>
      {(!desktop||accessPage==='verify'||session?.accessClass==='verification')&&form('Verificar correo','verificationConfirm',[{ name: 'token', label: 'Código del enlace de verificación', value: linkToken }])}
      {session?.accessClass !== 'verification' && (!desktop||accessPage==='reset'||limited) && <>{form('Solicitar restablecimiento','resetRequest',[email], 'Si existe una cuenta, recibirás un enlace. Esto no cancela una eliminación pendiente.')}
      {form('Establecer contraseña nueva','resetConfirm',[{ name: 'token', label: 'Código del enlace de recuperación', value: linkToken },next])}</>}
    </>}
    {desktop&&active&&<nav className="account-tabs" aria-label="Ajustes de cuenta">{[['profile','Perfil'],['security','Seguridad']].map(([id,label])=><button key={id} aria-current={settingsPage===id?'page':undefined} onClick={()=>setSettingsPage(id!)}>{label}</button>)}</nav>}
    {active && profile && <>{(!desktop||settingsPage==='profile')&&<><section><h2>Perfil</h2><p>{profile.email}</p><p>{profile.displayName}</p><p>Espacio: {(profile.usedBytes/1000000).toLocaleString('es')} MB de 2 GB</p></section>
      {form('Guardar perfil','updateProfile',[{ name: 'displayName', label: 'Nombre', value: profile.displayName ?? '' }])}</>}
      {(!desktop||settingsPage==='security')&&<>{form('Cambiar contraseña','password',[current,next])}
      <button disabled={disabled} onClick={() => void run(async () => { setScope(await client.query('scope', { accountId: profile.id }) as NonNullable<typeof scope>); setMessage('Revisa el contenido afectado antes de confirmar.'); })}>Revisar eliminación de cuenta</button>
      {scope && <section><h2>Contenido afectado</h2><ul>{scope.resources.map(resource => <li key={resource.id}>{resource.name ?? resource.id}</li>)}</ul><p>{scope.versions} versiones · {scope.files} archivos · {scope.bytes} bytes</p><p>Dispones de 30 días para recuperar la cuenta. Después se eliminará su contenido. Los documentos locales del CAD se conservan.</p>
        <AccountForm title="Solicitar eliminación" fields={[current,{ name: 'phrase', label: 'Escribe ELIMINAR MI CUENTA' }]} disabled={disabled} submit={values => run(() => mutation('deleteAccount', { ...values, scopeRevision: scope.scopeRevision }))} />
        <button onClick={() => setScope(null)}>Cancelar</button></section>}
    </>}</>}
    {limited && <section><h2>Cuenta pendiente de eliminación</h2><p>Solo puedes consultar el plazo o recuperar la cuenta.</p>{deletion && <p>Recuperable hasta {new Date(deletion.expiresAt).toLocaleString('es')}.</p>}
      <AccountForm title="Recuperar mi cuenta" fields={[{ name: 'confirmationText', label: 'Escribe Recuperar mi cuenta' }]} disabled={disabled} submit={values => run(() => mutation('recoverAccount', values))} />
      {form('Habilitar comprobación en este dispositivo','deletionCredential',[])}
    </section>}
    {session && <section><h2>Sesión</h2><button disabled={busy || (!desktop && !online)} onClick={() => void run(async () => { if (desktop) await client.query('localLogout'); else await client.mutate('logout'); await client.query('forgetSession'); setSession(null); setProfile(null); setDeletion(null); setScope(null); client.accountId = null; await refresh(); setMessage('Sesión cerrada.'); })}>Cerrar sesión</button>
      {active && (!desktop||settingsPage==='security') && <AccountForm title="Cerrar todas las sesiones" fields={[{ name: 'confirmation', label: 'Escribe CERRAR para confirmar, incluida esta sesión' }]} disabled={disabled} submit={values => run(async () => { if (values.confirmation !== 'CERRAR') throw new Error('Escribe CERRAR para confirmar.'); if (desktop) await client.query('localLogoutAll'); else await client.mutate('revokeAll', { confirmation: true }); await client.query('forgetSession'); setSession(null); setProfile(null); client.accountId = null; await refresh(); setMessage('Cierre solicitado. Consulta el estado antes de repetir si no hay confirmación.'); })} />}
    </section>}
    <details className="account-extra" open={desktop?undefined:true}><summary>Seguimiento de eliminación de cuenta</summary><section><h2>Estado de eliminación</h2><p>Esta comprobación no da acceso a contenido ni requiere una sesión normal.</p><button disabled={disabled} onClick={() => void run(async () => { await deletionChecks.current?.checkNow(); })}>Comprobar ahora</button>
      {checkMessage&&<p role="status">{checkMessage}</p>}
      {checks.map(row => <p key={row.requestId}>{row.state === 'deleted' ? 'Eliminación definitiva confirmada' : row.state === 'cancelled' ? 'Solicitud cancelada' : 'Eliminación pendiente'}</p>)}
    </section></details></main>;
}

