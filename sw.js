// sw.js - ميزان V21 - إشعارات خلفية تعمل حتى بعد إغلاق التطبيق
// صلاة الليل = قبل الشروق بـ 220 دقيقة
const CACHE = 'mizan-v21-3.23';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './control.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

let scheduledTimers = [];
let currentData = null;
const P_AR = {Fajr:'الفجر',Dhuhr:'الظهر',Maghrib:'المغرب',Layl:'صلاة الليل'};

function clearSchedules(){
  scheduledTimers.forEach(id=>clearTimeout(id));
  scheduledTimers=[];
}

function parseHM(t){
  if(!t ||!t.includes(':')) return null;
  let [h,m] = t.split(':').map(Number);
  if(isNaN(h) || isNaN(m)) return null;
  return {h,m,mins:h*60+m};
}

// === IndexedDB لحفظ الأوقات حتى بعد قتل الـ SW ===
function saveToIDB(data){
  return new Promise(res=>{
    try{
      let req=indexedDB.open('mizan_db',1);
      req.onupgradeneeded=e=>{ try{e.target.result.createObjectStore('prayers')}catch{} };
      req.onsuccess=e=>{
        let db=e.target.result;
        if(!db.objectStoreNames.contains('prayers')){ res(); return; }
        let tx=db.transaction('prayers','readwrite');
        tx.objectStore('prayers').put(data,'current');
        tx.oncomplete=()=>res();
        tx.onerror=()=>res();
      };
      req.onerror=()=>res();
    }catch{ res(); }
  });
}

function loadFromIDB(){
  return new Promise(res=>{
    try{
      let req=indexedDB.open('mizan_db',1);
      req.onupgradeneeded=e=>{ try{e.target.result.createObjectStore('prayers')}catch{} };
      req.onsuccess=e=>{
        let db=e.target.result;
        if(!db.objectStoreNames.contains('prayers')){ res(null); return; }
        let tx=db.transaction('prayers','readonly');
        let g=tx.objectStore('prayers').get('current');
        g.onsuccess=()=>res(g.result||null);
        g.onerror=()=>res(null);
      };
      req.onerror=()=>res(null);
    }catch{ res(null); }
  });
}

// === جدولة كل الصلوات في الخلفية ===
function scheduleAllPrayers(payload){
  clearSchedules();
  if(!payload ||!payload.timings) return;
  currentData = payload;
  const timings = payload.timings;
  const prefs = payload.prefs || {};

  Object.entries(timings).forEach(([en,timeStr])=>{
    if(en==='Sunrise' || en.startsWith('_')) return;
    if(en==='Asr' || en==='Isha') return; // حماية: تجاهل أي بيانات قديمة للعصر/العشاء
    if(prefs[en]===false) return; // المستخدم طافي هذا الإشعار
    let p=parseHM(timeStr);
    if(!p) return;

    let now=new Date();
    let target=new Date();
    target.setHours(p.h, p.m, 0, 0);
    // اذا وقت اليوم راح، جدوله لبكرة
    if(target <= now){
      target.setDate(target.getDate()+1);
    }
    let delay = target - now;
    if(delay < 0 || delay > 24*60*60*1000 + 60000) return; // أكثر من 24 ساعة لا تجدول

    let timerId = setTimeout(async()=>{
      try{
        let isLayl = en==='Layl';
        await self.registration.showNotification('حان وقت صلاة ' + (P_AR[en]||en),{
          body: isLayl? 'قم الليل ولو بركعة - قبل الشروق بـ 3 ساعات و40 دقيقة' : 'حان الآن موعد الأذان - توقيتك المخصص (النجف)',
          icon:'./icons/icon-192.png',
          badge:'./icons/icon-192.png',
          vibrate: isLayl? [200,100,200,100,400] : [300,100,300],
          tag:'prayer-'+en,
          requireInteraction:true,
          renotify:true,
          data:{en, url:'./'},
          actions:[{action:'open', title:'فتح التطبيق'}]
        });
        // بعد الإشعار بدقيقة، أعد جدولة كل الصلوات لليوم التالي
        setTimeout(()=>{ if(currentData) scheduleAllPrayers(currentData); }, 65000);
      }catch(e){
        console.log('notify error',e);
      }
    }, delay);

    scheduledTimers.push(timerId);
  });

  console.log(`[Mizan SW] تمت جدولة ${scheduledTimers.length} إشعارات خلفية`);
}

// === Install ===
self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>{
      return c.addAll(ASSETS).catch(err=>{
        console.log('بعض الأيقونات غير موجودة، نكمل الأساسيات');
        return c.addAll(['./','./index.html','./style.css','./main.js','./manifest.json','./offline.html']);
      });
    }).then(()=>self.skipWaiting())
  );
});

// === Activate - حذف الكاش القديم + تحميل الجدولة ===
self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith('mizan-') && k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim()).then(async()=>{
      let data=await loadFromIDB();
      if(data) scheduleAllPrayers(data);
    })
  );
});

// === Fetch ===
self.addEventListener('fetch', e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);

  // API الصلاة - شبكة مع fallback
  if(url.hostname.includes('aladhan.com')){
    e.respondWith(
      fetch(req, {signal: AbortSignal.timeout(4000)}).then(r=>{
        const cl=r.clone(); caches.open(CACHE).then(c=>c.put(req,cl)); return r;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  // صفحات التنقل - network first
  if(req.mode==='navigate'){
    e.respondWith(
      fetch(req).then(r=>{
        const cl=r.clone(); caches.open(CACHE).then(c=>c.put(req,cl)); return r;
      }).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html').then(i=>i||caches.match('./offline.html'))))
    );
    return;
  }

  // ملفاتنا المحلية - cache first (مهم للعمل بدون نت)
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

// === استقبال رسائل من الصفحة الرئيسية ===
self.addEventListener('message', e=>{
  if(!e.data) return;
  if(e.data.type==='SKIP_WAITING'){
    self.skipWaiting();
  }
  if(e.data.type==='UPDATE_PRAYER_TIMES'){
    // حفظ وجدولة
    saveToIDB(e.data).then(()=>scheduleAllPrayers(e.data));
  }
});

// === عند الضغط على الإشعار ===
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(let c of list){
        if(c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      if(clients.openWindow) return clients.openWindow(e.notification.data?.url || './');
    })
  );
});

// === للمستقبل: لو المتصفح يدعم periodic sync ===
self.addEventListener('periodicsync', e=>{
  if(e.tag==='prayer-sync'){
    e.waitUntil(
      loadFromIDB().then(d=>{ if(d) scheduleAllPrayers(d); })
    );
  }
});
