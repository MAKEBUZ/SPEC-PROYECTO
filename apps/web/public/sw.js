/* Only public, neutral install assets are cached. No authenticated responses,
 * API calls, files, session cookies or operation history enter CacheStorage. */
const CACHE='patron-public-shell-v1';
const PUBLIC=['/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC)));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('patron-public-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=='GET')return;
  if(url.pathname.startsWith('/v1/'))return; // Network only, including downloads.
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(new Request(event.request,{cache:'no-store'})).catch(async()=>await caches.match('/offline.html')??new Response('Sin conexión',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));return;
  }
  if(PUBLIC.includes(url.pathname)&&!url.search)event.respondWith(caches.match(url.pathname).then(cached=>cached??fetch(event.request)));
});
