'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation.js';

export function PortalShell({children}:{children:ReactNode}){
 const pathname=usePathname(),[dark,setDark]=useState(false);
 useEffect(()=>{
  let preference:string|null=null;try{preference=localStorage.getItem('patron.web.theme');}catch{}
  const value=preference==='dark'||(preference!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
  setDark(value);document.documentElement.dataset.theme=value?'dark':'light';
 },[]);
 function toggle(){const value=!dark;setDark(value);document.documentElement.dataset.theme=value?'dark':'light';try{localStorage.setItem('patron.web.theme',value?'dark':'light');}catch{}}
 return <div className="portal-shell">
  <a className="skip-link" href="#portal-content">Saltar al contenido</a>
  <aside className="portal-sidebar">
   <a className="portal-brand" href="/account"><span className="brand-symbol" aria-hidden="true">P<span>·</span></span><span>PATRONAJE<small>Tu taller, conectado</small></span></a>
   <p className="nav-label">TU ESPACIO</p>
   <nav aria-label="Navegación principal">{[['/account','Mi cuenta','Acceso, perfil y seguridad'],['/library','Mis patrones','Versiones y archivos guardados'],['/trash','Papelera','Revisa y recupera tu contenido']].map(([href,title,note])=><a key={href} href={href} aria-current={pathname.startsWith(href!)?'page':undefined}><span>{title}</span><small>{note}</small><span className="nav-arrow" aria-hidden="true">↗</span></a>)}</nav>
   <div className="sidebar-note"><span aria-hidden="true">✧</span><strong>Del dibujo a tu cuenta</strong><p>Crea tus piezas en el CAD. Publica una versión para consultarla y descargarla aquí.</p></div>
   <button className="theme-toggle" onClick={toggle} aria-pressed={dark}><span aria-hidden="true">{dark?'☀':'☾'}</span> {dark?'Activar modo claro':'Activar modo oscuro'}</button>
  </aside>
  <div className="portal-workspace"><div className="portal-topbar"><span>PORTAL PERSONAL</span><span>Diseña en el CAD · organiza aquí</span></div><div id="portal-content" tabIndex={-1}>{children}</div><footer className="portal-footer">PATRONAJE <span>Un espacio para tus ideas, pieza a pieza.</span></footer></div>
 </div>;
}
