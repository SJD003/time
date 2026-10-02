const CACHE='mizan-v10-notifications-fixed';
const ASSETS=['./','./index.html?v=10','./style.css?v=10','./main.js?v=10','./manifest.json?v=10','./offline.html'];

self.addEventListener('install', e=>{
  console.log('[SW V10] Installing with notification support');
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  console.log('[SW V10] Activating - cleaning old caches');
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>{
        console.log('[SW V10] Deleting old cache', k);
        return caches.delete(k);
      })
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  let req=e.request;
  if(req.url.includes('index.html') || req.url.includes('main.js') || req.url.includes('style.css') || req.url.includes('manifest.json')){
    e.respondWith(
      fetch(req).then(r=>{
        let cl=r.clone();
        caches.open(CACHE).then(c=>c.put(req,cl)).catch(()=>{});
        return r;
      }).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html')))
    );
    return;
  }
  if(req.url.includes('api.aladhan.com')){
    e.respondWith(fetch(req).then(r=>{
      let cl=r.clone(); caches.open(CACHE).then(c=>c.put(req,cl)).catch(()=>{}); return r;
    }).catch(()=>caches.match(req).then(c=>c||new Response(JSON.stringify({data:{timings:{Fajr:"04:20",Sunrise:"05:30",Dhuhr:"12:05",Asr:"15:40",Maghrib:"18:50",Isha:"20:15"}}),{headers:{'Content-Type':'application/json'}}))));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(fr=>{
    if(req.method==='GET' && req.url.startsWith(self.location.origin)){
      let cl=fr.clone(); caches.open(CACHE).then(c=>c.put(req,cl)).catch(()=>{});
    }
    return fr;
  }).catch(()=>caches.match('./offline.html'))));
});

self.addEventListener('message', e=>{
  if(e.data && e.data.type==='SKIP_WAITING'){ self.skipWaiting(); }
});

// إشعارات - معالجة النقر
self.addEventListener('notificationclick', e=>{
  console.log('[SW] Notification clicked', e.action);
  e.notification.close();
  
  if (e.action === 'open' || !e.action) {
    e.waitUntil(
      clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
        for(let c of list) {
          if(c.url.includes(self.location.origin) && 'focus' in c) {
            return c.focus();
          }
        }
        if(clients.openWindow) return clients.openWindow('./');
      })
    );
  }
});

self.addEventListener('notificationclose', e=>{
  console.log('[SW] Notification closed');
});

// للسماح للإشعارات بالعمل حتى بدون فتح التطبيق - Push API مستقبلاً
self.addEventListener('push', e=>{
  console.log('[SW] Push received');
  if (e.data) {
    let data = e.data.json();
    e.waitUntil(
      self.registration.showNotification(data.title || 'ميزان', {
        body: data.body || 'حان وقت الصلاة',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png'
      })
    );
  }
});
