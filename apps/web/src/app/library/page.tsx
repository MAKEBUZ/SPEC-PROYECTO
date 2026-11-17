'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { BrowserSession } from '../../auth/session.js';
import { DTO } from '../../../../../packages/contracts/src/http-dto.js';
import type { HttpDto } from '../../../../../packages/contracts/src/http-dto.js';
import { VersionFiles } from '../../components/version-files.js';
export default function LibraryPage(){
  const session=useMemo(()=>new BrowserSession(),[]),generation=useRef(0),accountId=useRef<string|undefined>(undefined);
  const [projects,setProjects]=useState<HttpDto<'ProjectView'>[]>([]),[patterns,setPatterns]=useState<HttpDto<'PatternView'>[]>([]),[versions,setVersions]=useState<HttpDto<'VersionView'>[]>([]),[chosen,setChosen]=useState<HttpDto<'VersionView'>>();
  const [project,setProject]=useState(''),[pattern,setPattern]=useState(''),[cursor,setCursor]=useState<string|null>(null),[level,setLevel]=useState<'projects'|'patterns'|'versions'>('projects'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const clear=()=>{generation.current++;setBusy(false);setProjects([]);setPatterns([]);setVersions([]);setChosen(undefined);setCursor(null);setProject('');setPattern('');};
  async function load(target:'projects'|'patterns'|'versions',id='',more=false){
    const current=++generation.current;setBusy(true);setMessage('');setChosen(undefined);
    try{
      const path=target==='projects'?'/projects':target==='patterns'?`/projects/${id}/patterns`:`/patterns/${id}/versions`;
      const response=await session.request(`/v1${path}${more&&cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);
      if(!response.ok)throw new Error(response.status===401||response.status===403?'Inicia sesión con una cuenta verificada para acceder a tus proyectos.':'No se pudo consultar la biblioteca.');
      const body:unknown=await response.json();if(current!==generation.current)return;
      if(target==='projects'){const page=DTO.ProjectPage.parse(body);accountId.current=page.items[0]?.ownerId;setProjects(old=>more?[...old,...page.items]:page.items);setPatterns([]);setVersions([]);setProject('');setPattern('');setCursor(page.nextCursor);}
      else if(target==='patterns'){const page=DTO.PatternPage.parse(body);setPatterns(old=>more?[...old,...page.items]:page.items);setVersions([]);setProject(id);setPattern('');setCursor(page.nextCursor);}
      else {const page=DTO.VersionPage.parse(body);setVersions(old=>more?[...old,...page.items]:page.items);setPattern(id);setCursor(page.nextCursor);}
      setLevel(target);
    }catch(e){if(current===generation.current){clear();setMessage(e instanceof Error?e.message:'No se pudo consultar.');}}
    finally{if(current===generation.current)setBusy(false);}
  }
  useEffect(()=>{
    void load('projects');
    const offline=()=>{clear();setMessage('Sin conexión. La biblioteca requiere conexión y una sesión válida.');};
    const verify=async()=>{try{const reply=await session.request('/v1/account/profile');if(!reply.ok){clear();setMessage('Inicia sesión para volver a consultar la biblioteca.');}else{const profile=DTO.AccountProfile.parse(await reply.json());if(accountId.current&&accountId.current!==profile.id){clear();setMessage('La cuenta cambió. Actualiza los proyectos.');}accountId.current=profile.id;}}catch{offline();}};
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('patron-account-state'):undefined;
    if(channel)channel.onmessage=()=>{clear();setMessage('La sesión cambió. Actualiza los proyectos para volver a consultar.');};
    const timer=setInterval(()=>void verify(),15000);window.addEventListener('offline',offline);window.addEventListener('focus',verify);
    return()=>{generation.current++;channel?.close();clearInterval(timer);window.removeEventListener('offline',offline);window.removeEventListener('focus',verify);};
  },[session]);
  return <main className="library"><nav><a href="/account">Cuenta</a> · <a href="/trash">Proyectos y papelera</a></nav><h1>Mis proyectos</h1><p>Consulta tus patrones publicados y sus versiones. La edición se realiza en el CAD.</p>
    {message&&<p role="alert">{message}</p>}{busy&&<p role="status">Consultando…</p>}
    <button disabled={busy} onClick={()=>void load('projects')}>Actualizar proyectos</button>
    <ul>{projects.map(p=><li key={p.id}><button disabled={busy} aria-pressed={project===p.id} onClick={()=>void load('patterns',p.id)}>{p.name}</button></li>)}</ul>
    {project&&<section><h2>Patrones</h2>{!patterns.length&&!busy&&<p>No hay patrones publicados en este proyecto.</p>}<ul>{patterns.map(p=><li key={p.id}><button disabled={busy} aria-pressed={pattern===p.id} onClick={()=>void load('versions',p.id)}>{p.name}</button></li>)}</ul></section>}
    {pattern&&<section><h2>Versiones</h2><ul>{versions.map(v=><li key={v.id}><button disabled={busy} aria-pressed={chosen?.id===v.id} onClick={()=>setChosen(v)}>Versión {v.ordinal}</button> — <time dateTime={v.createdAt}>{new Date(v.createdAt).toLocaleString('es')}</time> · Autor: {v.authorId===accountId.current?'Tú (propietario)':'Autor no disponible'}</li>)}</ul></section>}
    {cursor&&<button disabled={busy} onClick={()=>void load(level,level==='patterns'?project:pattern,true)}>Cargar más</button>}
    {chosen&&<VersionFiles key={chosen.id} files={chosen.files} session={session}/>}
  </main>;
}
