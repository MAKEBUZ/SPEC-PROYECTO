import { formHelp } from '../ui.js';
import { useState,type ReactNode } from 'react';
import { userMessage } from '../messages.js';
export function ActionForm({name,title,children,run,onError}:{name:string;title:string;children:ReactNode;run:(data:FormData)=>void;onError:(message:string)=>void}){
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  return <form data-action={name} onChange={()=>setPending(true)} onSubmit={e=>{e.preventDefault();try{run(new FormData(e.currentTarget));setPending(false);setError('');onError('');}catch(error){const message=userMessage(error instanceof Error?error.message:'No se pudo completar la acción.');setError(message);onError(message);}}}><fieldset><legend>{title}</legend>{(formHelp[name]||name.startsWith('placement-'))&&<p className="form-help">{formHelp[name]??'Modifica solo la colocación de impresión. La pieza original del CAD no cambia. X/Y son desplazamientos; la rotación se expresa en grados.'}</p>}{children}<button type="submit">{title}</button>{pending&&<p role="status">Cambios sin aplicar en este formulario. La validación y el PDF usan los últimos datos aplicados.</p>}{name==='properties'&&error&&<p role="alert">No se aplicaron los datos. {error}</p>}</fieldset></form>;
}
export const number=(f:FormData,name:string)=>{const s=f.get(name),label=({gx1:'Hilo inicio X',gy1:'Hilo inicio Y',gx2:'Hilo fin X',gy2:'Hilo fin Y',cutQuantity:'Cantidad a cortar',margin:'Margen imprimible'} as Record<string,string>)[name]??'el campo numérico';if(typeof s!=='string'||!s.trim())throw new Error(`Completa ${label}.`);const n=Number(s);if(!Number.isFinite(n))throw new Error(`Introduce un número finito en ${label}.`);return n;};
export function Numeric({name,label,value=0}:{name:string;label:string;value?:number}){return <label>{label}<input name={name} defaultValue={value} inputMode="decimal" /></label>;}

