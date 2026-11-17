import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest {
  return {id:'/',name:'Patronaje',short_name:'Patronaje',description:'Consulta tus proyectos, patrones y archivos publicados.',lang:'es',start_url:'/library',scope:'/',display:'standalone',background_color:'#ffffff',theme_color:'#075985',icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
}
