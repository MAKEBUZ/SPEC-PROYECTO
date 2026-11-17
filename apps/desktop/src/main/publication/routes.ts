/** Main-owned allowlist: no arbitrary URLs, downloads or user supplied headers. */
export function publicationRoute(method:string,path:string){
 const id='[a-f0-9-]{36}';
 if(method==='GET')return /^\/projects(?:\?limit=100(?:&cursor=[^&]*)?)?$/.test(path)||new RegExp(`^/(?:projects|patterns|publications)/${id}$`).test(path)||new RegExp(`^/patterns/${id}/publication-status$`).test(path)||new RegExp(`^/versions/${id}/files$`).test(path)||new RegExp(`^/files/${id}/content$`).test(path)||new RegExp(`^/operations/${id}\\?operationType=(?:beginPublication|commitPublication|createProject|abandonPublication)$`).test(path);
 if(method==='POST')return path==='/projects'||path==='/publications'||new RegExp(`^/publications/${id}/(?:commit|abandon)$`).test(path);
 return method==='PUT'&&new RegExp(`^/publications/${id}/files/${id}$`).test(path);
}
