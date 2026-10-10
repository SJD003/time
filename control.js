// control.js - نظام التحكم الذكي V2
const LOCAL_VERSION = "21"; // نفس رقم version الي فوق

async function checkAppConfig(){
  try{
    // نجيب الكونفك بدون كاش
    let res = await fetch('./app-config.json?v='+Date.now(), {cache:'no-store'});
    if(!res.ok) return;
    let cfg = await res.json();

    // 1- وضع الصيانة
    if(cfg.maintenance){
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f0f0f;color:#d6c7a1;text-align:center;padding:30px">
          <div style="font-size:60px">🛠️</div>
          <h2 style="margin:20px 0">${cfg.maintenanceMessage || 'جاري التحديث...'}</h2>
          <p style="color:#888">الإصدار القادم: v${cfg.version}</p>
          <button onclick="location.reload()" style="margin-top:20px;background:#d6c7a1;color:#000;border:none;padding:10px 20px;border-radius:10px;font-weight:700">تحديث</button>
        </div>`;
      return true;
    }

    // 2- يوجد تحديث جديد
    if(cfg.version !== LOCAL_VERSION || cfg.forceUpdate){
      let banner = document.createElement('div');
      banner.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#d6c7a1;color:#000;padding:12px;text-align:center;font-weight:700;display:flex;justify-content:space-between;align-items:center">
          <span>🚀 ${cfg.whatsNew || 'يوجد تحديث جديد'}</span>
          <button onclick="forceUpdateApp()" style="background:#000;color:#d6c7a1;border:none;padding:6px 12px;border-radius:8px">تحديث الآن</button>
        </div>`;
      document.body.prepend(banner);
    }

    // 3- نافذة شنو الجديد - مرة وحدة
    if(cfg.showWhatsNew && cfg.whatsNew && localStorage.getItem('lastSeenVersion') !== cfg.version){
      setTimeout(()=>{
        if(confirm(cfg.whatsNew + '\n\nهل تريد رؤية التحديث؟')){
          localStorage.setItem('lastSeenVersion', cfg.version);
        }
      }, 2000);
    }

  }catch(e){ console.log('config check failed', e); }
}

function forceUpdateApp(){
  localStorage.removeItem('mizan_cached_timings');
  if('caches' in window){ caches.keys().then(k=>k.forEach(c=>caches.delete(c))); }
  location.reload(true);
}

// شغل الفحص أول ما يفتح التطبيق
checkAppConfig();
setInterval(checkAppConfig, 60000); // كل دقيقة يفحص