import { useEffect,useState } from 'react';
import type { CadTools } from './tools.js';
import type { PiecePreview } from './geometry-preview.js';

export function useGeometryPreview(tools:CadTools){
  const version=tools.getVersion();
  const [state,setState]=useState<{version:number;pieces:Record<string,PiecePreview>;failed:boolean}>({version:-1,pieces:{},failed:false});
  useEffect(()=>{
    let active=true;
    setState({version,pieces:{},failed:false});
    let worker:Worker;
    try {worker=new Worker(new URL('./geometry-preview.worker.ts',import.meta.url),{type:'module'});}
    catch {setState({version,pieces:{},failed:true});return;}
    worker.onmessage=(event:MessageEvent<PiecePreview>)=>{
      if(active)setState(previous=>({version,pieces:{...previous.pieces,[event.data.id]:event.data},failed:false}));
    };
    worker.onerror=()=>{if(active)setState(previous=>({...previous,failed:true}));worker.terminate();};
    worker.postMessage(tools.document().pieces);
    // A newer edit never waits for an obsolete algebraic calculation.
    return ()=>{active=false;worker.terminate();};
  },[tools,version]);
  return state.version===version?state:{version,pieces:{},failed:false};
}
