// control.js - ميزان V21 / V3.22 - نظام التحكم بالتحديثات والإشعارات الخلفية
const LOCAL_VERSION = "3.23";
const MIN_VERSION = "3.0";
const CHECK_INTERVAL = 60000; // كل دقيقة

async function checkAppConfig(){
  try{
    let res = await fetch('./app-config.json?v='+Date.now(), {cache:'no-store'});
    if(!res.ok) return;
    let cfg = await res.json();

    // 1- وضع الصيانة
    if(cfg.maintenance){
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0f0f0f;color:#d6c7a1;text-align:center;padding:30px;font-family:system-ui,Tahoma,sans-serif">
          <div style="font-size:64px;animation: pulse 2s infinite">🛠️</div>
          <h2 style="margin:20px 0 10px;font-size:22px;font-weight:800">${cfg.maintenanceMessage||'جاري التحديث...'}</h2>
          <p style="color:#9aa0a6;font-size:13px;margin-bottom:20px">سيعود التطبيق خلال دقائق</p>
          <button onclick="location.reload()" style="margin-top:10px;background:#d6c7a1;color:#000;border:none;padding:12px 24px;border-radius:12px;font-weight:800;cursor:pointer">تحديث الصفحة</button>
        </div>
        <style>@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}</style>`;
      return true;
    }

    // 2- فحص الحد الأدنى للإصدار
    if(cfg.minVersion && LOCAL_VERSION < cfg.minVersion){
      forceUpdateApp(cfg.version);
      return;
    }

    // 3- شريط التحديث الجديد
    let lastSeen = localStorage.getItem('lastSeenVersion');
    let isNewVersion = cfg.version && cfg.version !== LOCAL_VERSION;
    let shouldShow = cfg.forceUpdate || (isNewVersion && lastSeen !== cfg.version && cfg.showWhatsNew);

    if(shouldShow){
      let old = document.getElementById('updateBanner'); if(old) old.remove();
      let banner = document.createElement('div');
      banner.id = 'updateBanner';
      banner.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(90deg,#d6c7a1,#c7b07a);color:#000;padding:12px 16px;text-align:center;font-weight:800;display:flex;justify-content:space-between;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui,Tahoma,sans-serif;animation:slideDown 0.4s ease">
          <span style="flex:1;text-align:right;font-size:13px;line-height:1.4">🚀 ${cfg.whatsNew || 'تمت إضافة ميزات جديدة - صلاة الليل 220د + خلفية'}</span>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button onclick="forceUpdateApp('${cfg.version}')" style="background:#000;color:#d6c7a1;border:none;padding:7px 14px;border-radius:9px;font-weight:800;font-size:12px;cursor:pointer">تحديث الآن</button>
            <button onclick="dismissUpdate('${cfg.version}')" style="background:transparent;color:#000;border:1.5px solid #000;padding:6px 10px;border-radius:9px;font-weight:800;font-size:12px;cursor:pointer">✕</button>
          </div>
        </div>
        <style>@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}</style>`;
      document.body.prepend(banner);
      document.body.style.paddingTop = '52px';
    }

  }catch(e){ console.log('config check fail', e); }
}

function forceUpdateApp(ver){
  try{
    localStorage.setItem('lastSeenVersion', ver || LOCAL_VERSION);
    localStorage.removeItem('mizan_cached_timings');
    // حذف كاش الـ SW القديم
    if('caches' in window){
      caches.keys().then(keys=>keys.forEach(k=>{
        if(k.startsWith('mizan-')) caches.delete(k);
      }));
    }
    // إلغاء تسجيل الـ SW القديم ليعاد تسجيل الجديد
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistrations().then(regs=>{
        regs.forEach(r=>r.update());
      });
    }
  }catch{}
  location.reload(true);
}

function dismissUpdate(ver){
  try{
    localStorage.setItem('lastSeenVersion', ver || LOCAL_VERSION);
    let b=document.getElementById('updateBanner'); if(b) b.remove();
    document.body.style.paddingTop='0';
  }catch{}
}

// تشغيل
checkAppConfig();
setInterval(checkAppConfig, CHECK_INTERVAL);
window.addEventListener('focus', checkAppConfig);