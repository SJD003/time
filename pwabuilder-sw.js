const CACHE='mizan-v8-final';
const ASSETS=['./','./index.html','./style.css','./main.js','./manifest.json','./offline.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{})); self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim()});
self.addEventListener('fetch',e=>{
  let req=e.request;
  if(req.url.includes('api.aladhan.com')){
    e.respondWith(fetch(req).then(r=>{
      let cl=r.clone(); caches.open(CACHE).then(c=>c.put(req,cl)).catch(()=>{}); return r;
    }).catch(()=>caches.match(req).then(c=>c||new Response(JSON.stringify({data:{timings:{Fajr:"04:20",Sunrise:"05:20",Dhuhr:"12:05",Asr:"15:40",Maghrib:"18:50",Isha:"20:15"}}}),{headers:{'Content-Type':'application/json'}}))));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(fr=>{
    if(req.method==='GET' && req.url.startsWith(self.location.origin)){
      let cl=fr.clone(); caches.open(CACHE).then(c=>c.put(req,cl)).catch(()=>{});
    }
    return fr;
  }).catch(()=>caches.match('./offline.html'))));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(let c of list) if(c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
    if(clients.openWindow) return clients.openWindow('./');
  }));
});
