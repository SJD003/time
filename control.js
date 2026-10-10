const LOCAL_VERSION = "3";
const MIN_VERSION = "0.10";

async function checkAppConfig(){
  try{
    let res = await fetch('./app-config.json?v='+Date.now(), {cache:'no-store'});
    if(!res.ok) return;
    let cfg = await res.json();

    // وضع الصيانة
    if(cfg.maintenance){
      document.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f0f0f;color:#d6c7a1;text-align:center;padding:30px"><div style="font-size:60px">🛠️</div><h2 style="margin:20px 0">${cfg.maintenanceMessage||'جاري التحديث...'}</h2><button onclick="location.reload()" style="margin-top:20px;background:#d6c7a1;color:#000;border:none;padding:10px 20px;border-radius:10px;font-weight:700">تحديث</button></div>`;
      return true;
    }

    // شريط التحديث - يظهر فقط اذا اكو اصدار جديد وما شايفه قبل
    let lastSeen = localStorage.getItem('lastSeenVersion');
    let shouldShow = (cfg.forceUpdate) || (cfg.version && cfg.version !== LOCAL_VERSION && lastSeen !== cfg.version && cfg.showWhatsNew);

    if(shouldShow){
      let old = document.getElementById('updateBanner'); if(old) old.remove();
      let banner = document.createElement('div');
      banner.id = 'updateBanner';
      banner.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#d6c7a1;color:#000;padding:12px 16px;text-align:center;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>🚀 ${cfg.whatsNew || 'تمت إضافة ميزات جديدة'}</span>
          <div style="display:flex;gap:8px">
            <button onclick="forceUpdateApp('${cfg.version}')" style="background:#000;color:#d6c7a1;border:none;padding:6px 12px;border-radius:8px">تحديث الآن</button>
            <button onclick="dismissUpdate('${cfg.version}')" style="background:transparent;color:#000;border:1px solid #000;padding:6px 10px;border-radius:8px">✕</button>
          </div>
        </div>`;
      document.body.prepend(banner);
      document.body.style.paddingTop = '50px';
    }

  }catch(e){}
}

function forceUpdateApp(ver){
  localStorage.setItem('lastSeenVersion', ver || LOCAL_VERSION);
  localStorage.removeItem('mizan_cached_timings');
  if('caches' in window){ caches.keys().then(k=>k.forEach(c=>caches.delete(c))); }
  location.reload();
}
function dismissUpdate(ver){
  localStorage.setItem('lastSeenVersion', ver || LOCAL_VERSION);
  let b=document.getElementById('updateBanner'); if(b) b.remove();
  document.body.style.paddingTop='0';
}

checkAppConfig();
setInterval(checkAppConfig, 60000);