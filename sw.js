const CACHE='reciprocity-meter-v1.3.1';
const ASSETS=['./','./index.html','./styles.css?v=1.3.1','./app.js?v=1.3.1','./core.mjs?v=1.3.1','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('reciprocity-meter-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 // Network-first navigation prevents the previous HTML from pinning older JS and CSS.
 if(request.mode==='navigate'){
   event.respondWith(
     fetch(request).then(response=>{
       if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./index.html',copy)));}
       return response;
     }).catch(async()=>await caches.match('./index.html') || await caches.match('./'))
   );
   return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});