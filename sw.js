const CACHE='mizan-v15-icon-compass-fixed';
const ASSETS=[
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(err=>{
      // حتى لو فشل أيقونة، كمل
      return c.addAll(['./','./index.html','./style.css','./main.js','./manifest.json','./offline.html']);
    })).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith('mizan-') && k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);

  // API الصلاة: شبكة مع fallback للكاش + لا تعطل التطبيق
  if(url.hostname.includes('aladhan.com')){
    e.respondWith(
      fetch(req, {signal: AbortSignal.timeout(4000)}).then(r=>{
        const cl=r.clone(); caches.open(CACHE).then(c=>c.put(req,cl)); return r;
      }).catch(()=>caches.match(req).then(c=>c||new Response(JSON.stringify({data:{timings:{Fajr:"04:20",Sunrise:"05:30",Dhuhr:"12:05",Asr:"15:40",Maghrib:"18:50",Isha:"20:15"}}}),{headers:{'Content-Type':'application/json'}})))
    );
    return;
  }

  // صفحات التنقل: network-first ثم cache ثم offline.html
  if(req.mode==='navigate'){
    e.respondWith(
      fetch(req).then(r=>{
        const cl=r.clone(); caches.open(CACHE).then(c=>c.put(req,cl)); return r;
      }).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html').then(i=>i||caches.match('./offline.html'))))
    );
    return;
  }

  // ملفاتنا المحلية: cache-first (أهم نقطة للعمل بدون نت)
  if(url.origin===location.origin){
    e.respondWith(
      caches.match(req).then(cached=>{
        if(cached) return cached;
        return fetch(req).then(r=>{
          if(r.ok){
            const cl=r.clone(); caches.open(CACHE).then(c=>c.put(req,cl));
          }
          return r;
        }).catch(()=>caches.match('./offline.html'));
      })
    );
    return;
  }
});

self.addEventListener('message', e=>{ if(e.data?.type==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(let c of list){ if(c.url.includes(self.location.origin) && 'focus' in c) return c.focus(); }
    if(clients.openWindow) return clients.openWindow('./');
  }));
});
