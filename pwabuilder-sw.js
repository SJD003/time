importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');
const CACHE = "mizan-cache-v9-offline-astronomical";
const offlineFallbackPage = "offline.html";
const PRECACHE_URLS = ["./","./index.html","./style.css","./main.js","./manifest.json","./offline.html","./icons/icon-192.png","./icons/icon-192-maskable.png","./icons/icon-512.png","./icons/icon-512-maskable.png","./icons/apple-touch-icon.png"];
self.addEventListener("message", (e)=>{ if(e.data&&e.data.type==="SKIP_WAITING") self.skipWaiting(); });
self.addEventListener('install', (e)=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE_URLS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', (e)=>{ e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())); });
if(workbox.navigationPreload.isSupported()) workbox.navigationPreload.enable();
self.addEventListener('fetch', (e)=>{
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{ const r=await e.preloadResponse; if(r) return r; return await fetch(e.request); }
      catch(err){ const c=await caches.open(CACHE); return (await c.match(offlineFallbackPage)) || c.match("./index.html"); }
    })());
  } else {
    e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{
      const clone=r.clone(); caches.open(CACHE).then(ca=>ca.put(e.request,clone)); return r;
    })));
  }
});