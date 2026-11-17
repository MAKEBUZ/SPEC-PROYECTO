import type { CadTools } from '../cad/tools.js';
export function captureActiveDocument(tools:CadTools,request:(value:Record<string,unknown>)=>Promise<{status:string;error?:{message:string}}>,notice:(value:string)=>void){
  let stopped=false,busy=false;
  const capture=async()=>{
    if(stopped||busy)return;busy=true;
    try{
      const result=await request({requestId:crypto.randomUUID(),method:'recovery.capture',snapshot:tools.document()});
      if(result.status!=='success')throw Error(result.error?.message||'No se pudo guardar la copia de recuperación.');
      if(!stopped)notice('');
    }catch{if(!stopped)notice('No se pudo guardar la copia de recuperación. Se reintentará automáticamente.');}
    finally{busy=false;}
  };
  const timer=setInterval(()=>void capture(),60000);void capture();
  return ()=>{stopped=true;clearInterval(timer);};
}
