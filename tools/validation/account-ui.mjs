import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executablePath) throw new Error('Falta Edge local para validar la UI.');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','4319'], { windowsHide: true, stdio: 'pipe', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
let browser;
try {
  for (let i=0; i<100; i++) { try { if ((await fetch('http://127.0.0.1:4319/account')).ok) break; } catch {} await new Promise(r => setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1150, height: 900 } });
  const accountId = randomUUID(); let role = 'normal', calls = 0, failProfile = false;
  const session = () => ({ id: randomUUID(), accountId, accessClass: role, startedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+86400000).toISOString() });
  await page.route('**/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, body = request.postDataJSON();
    let data = {}, status = 200;
    if (path.endsWith('/auth/csrf')) data = { token: 'synthetic-csrf' };
    else if (path === '/v1/sessions') data = session();
    else if (path === '/v1/account/profile' && request.method() === 'GET') data = { id: accountId, email: 'cuenta@example.invalid', displayName: 'Cuenta de prueba', verifiedAt: new Date().toISOString(), status: 'active', usedBytes: 0, reservedBytes: 0, limitBytes: 2000000000 };
    else if (path === '/v1/account/profile' && failProfile) { calls++; await route.abort('failed'); return; }
    else if (path === '/v1/password-reset/request') { status = 202; data = { operationId: body.operationId, state: 'pending' }; }
    else if (path === '/v1/account/deletion' && request.method() === 'GET') data = { status: 'deletion_pending', requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+86400000).toISOString(), operationId: randomUUID() };
    else data = { operationId: body?.operationId, state: 'resolved', outcome: 'success', confirmedAt: new Date().toISOString(), data: {} };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const form = title => page.locator('form').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  async function login() { const f = form('Iniciar sesión'); await f.getByLabel('Correo electrónico').fill('cuenta@example.invalid'); await f.getByLabel('Contraseña', { exact: true }).fill('Sintética-42!'); await f.getByRole('button').click(); }
  await page.goto('http://127.0.0.1:4319/account');
  await expect(form('Iniciar sesión')).toBeVisible(); await login(); await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible();
  mkdirSync('.local', { recursive: true }); await page.screenshot({ path: '.local/account-web.png', fullPage: true });
  failProfile = true; await form('Guardar perfil').getByLabel('Nombre').fill('Nuevo nombre'); await form('Guardar perfil').getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Resultado pendiente de comprobar' })).toBeVisible();
  await form('Guardar perfil').getByRole('button').click(); expect(calls).toBe(1);
  const stored = await page.evaluate(() => localStorage.getItem('patron.account-pending')); expect(stored).not.toContain('Nuevo nombre'); expect(stored).not.toContain('Sintética');
  await page.reload(); await expect(page.getByRole('heading', { name: 'Resultado pendiente de comprobar' })).toBeVisible();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload(); role = 'verification'; await login();
  await expect(form('Reenviar verificación')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toHaveCount(0);
  await expect(form('Solicitar restablecimiento')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  role = 'account_recovery'; await login(); await expect(page.getByRole('heading', { name: 'Cuenta pendiente de eliminación' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar eliminación de cuenta' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  const reset = form('Solicitar restablecimiento'); await reset.getByLabel('Correo electrónico').fill('cuenta@example.invalid'); await reset.getByRole('button').click();
  await expect(page.getByText('Si existe una cuenta, recibirás un enlace de recuperación.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: '.local/account-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.context().setOffline(true); await expect(form('Iniciar sesión').getByRole('button')).toBeDisabled();
  await page.context().setOffline(false);
  await page.goto('http://127.0.0.1:4319/account/reset-password?token=synthetic-link-token');
  await expect(form('Establecer contraseña nueva').getByLabel('Código del enlace de recuperación')).toHaveValue('synthetic-link-token');
  expect(page.url()).not.toContain('token=');
  console.log('UI PASS: perfil, incertidumbre sin reenvío, reapertura, verificación, recuperación limitada, reset genérico, móvil, offline y enlace sin consumo automático. HTTP simulado; no sustituye T026.');
} finally { await browser?.close(); server.kill(); }
