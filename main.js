// ميزان برو V7 - النجف + إشعارات + بدون نت + حساب فلكي دقيق + قبلة فلكية
const $ = id=>document.getElementById(id);
const LS = {
  j:k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},
  g:(k,d=null)=>localStorage.getItem(k)??d,
  s:(k,v)=>localStorage.setItem(k, typeof v==='object'?JSON.stringify(v):v),
  b:(k)=>localStorage.getItem(k)==='true'
};
const NAJAF = {lat:32.0273,lng:44.3393};
const KAABA = {lat:21.422507,lng:39.826209}; // الكعبة المشرفة - إحداثيات دقيقة WGS84
const P_AR = {Fajr:'الفجر',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};

let db = LS.j('mizan_pro_v5') || {sins:[{n:"الغيبة",d:false,nt:""}],obeys:[{n:"الصلوات الخمس",d:false,nt:""}],lastUpdate:new Date().toLocaleDateString()};
let activeTab='sins', editIdx=null, prayerTimes=null;
let notifiedCache = LS.j('mizan_notified_today') || {};

// ===== محرك فلكي دقيق يعمل بدون نت =====
class AstroPrayer{
  constructor(lat,lng,tz=3){this.lat=lat;this.lng=lng;this.tz=tz;this.D2R=Math.PI/180;this.R2D=180/Math.PI}
  fixA(a){a%=360;return a<0?a+360:a}
  fixH(h){h%=24;return h<0?h+24:h}
  julian(d){
    let y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();
    if(m<=2){y--;m+=12}
    let A=Math.floor(y/100),B=2-A+Math.floor(A/4);
    return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+day+B-1524.5;
  }
  sunPos(jd){
    let D=jd-2451545.0;
    let g=this.fixA(357.529+0.98560028*D);
    let q=this.fixA(280.459+0.98564736*D);
    let L=this.fixA(q+1.915*Math.sin(g*this.D2R)+0.02*Math.sin(2*g*this.D2R));
    let e=23.439-0.00000036*D;
    let RA=Math.atan2(Math.cos(e*this.D2R)*Math.sin(L*this.D2R),Math.cos(L*this.D2R))*this.R2D;
    RA=this.fixA(RA);
    let decl=Math.asin(Math.sin(e*this.D2R)*Math.sin(L*this.D2R))*this.R2D;
    let eqt=q/15-this.fixA(RA)/15;
    return{decl,eqt};
  }
  midDay(jd){
    let s=this.sunPos(jd);
    return this.fixH(12+this.tz-this.lng/15-s.eqt);
  }
  sunAngleTime(angle, jd, isMorning=true){
    let s=this.sunPos(jd);
    let noon=this.midDay(jd);
    let cosH=(Math.sin(-angle*this.D2R)-Math.sin(this.lat*this.D2R)*Math.sin(s.decl*this.D2R))/(Math.cos(this.lat*this.D2R)*Math.cos(s.decl*this.D2R));
    if(cosH<-1||cosH>1) return null;
    let H=Math.acos(cosH)*this.R2D/15;
    return isMorning?noon-H:noon+H;
  }
  asrTime(factor, jd){
    let s=this.sunPos(jd);
    let delta=Math.abs(this.lat-s.decl);
    let cot = factor + Math.tan(delta*this.D2R);
    let angle = Math.atan(1/cot)*this.R2D;
    return this.sunAngleTime(90-angle, jd, false);
  }
  toHM(floatH){
    if(floatH==null) return null;
    floatH=this.fixH(floatH);
    let h=Math.floor(floatH);
    let m=Math.round((floatH-h)*60);
    if(m>=60){h++;m-=60}
    if(h>=24)h-=24;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  calc(date=new Date()){
    let jd=this.julian(date);
    let sunriseF=this.sunAngleTime(0.833,jd,true);
    let sunsetF=this.sunAngleTime(0.833,jd,false);
    let dhuhrF=this.midDay(jd);
    let asrF=this.asrTime(1,jd);
    let raw={Sunrise:sunriseF,Dhuhr:dhuhrF,Asr:asrF,Maghrib:sunsetF,Isha:sunsetF+1.5,FajrRaw:sunriseF};
    const addM=(f,m)=>{if(f==null)return null; return f+m/60};
    return {
      Fajr:this.toHM(addM(raw.Sunrise,-60)), // قبل الشروق بساعة
      Dhuhr:this.toHM(addM(raw.Dhuhr,10)),
      Asr:this.toHM(addM(raw.Asr,10)),
      Maghrib:this.toHM(addM(raw.Maghrib,10)),
      Isha:this.toHM(addM(raw.Isha,5)),
      Sunrise:this.toHM(raw.Sunrise)
    };
  }
}

// ===== محرك القبلة الفلكي الدقيق =====
class QiblaEngine{
  constructor(){this.D2R=Math.PI/180;this.R2D=180/Math.PI;this.KAABA=KAABA}
  // حساب اتجاه القبلة بدقة - صيغة كروية دقيقة
  bearing(lat,lng){
    let φ1=lat*this.D2R, λ1=lng*this.D2R, φ2=this.KAABA.lat*this.D2R, λ2=this.KAABA.lng*this.D2R;
    let Δλ=λ2-λ1;
    let y=Math.sin(Δλ)*Math.cos(φ2);
    let x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    let br=Math.atan2(y,x)*this.R2D;
    return (br+360)%360; // 0-360 من الشمال باتجاه عقارب الساعة
  }
  // المسافة إلى الكعبة (كم) - Haversine دقيق
  distance(lat,lng){
    let φ1=lat*this.D2R, φ2=this.KAABA.lat*this.D2R;
    let Δφ=(this.KAABA.lat-lat)*this.D2R, Δλ=(this.KAABA.lng-lng)*this.D2R;
    let a=Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    let c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    return 6371*c; // نصف قطر الأرض
  }
  // الاتجاه بالعربي
  directionText(b){
    if(b>=337.5||b<22.5) return 'شمال';
    if(b<67.5) return 'شمال شرقي';
    if(b<112.5) return 'شرق';
    if(b<157.5) return 'جنوب شرقي';
    if(b<202.5) return 'جنوب';
    if(b<247.5) return 'جنوب غربي';
    if(b<292.5) return 'غرب';
    return 'شمال غربي';
  }
}
const qiblaEngine = new QiblaEngine();
let qiblaState = {bearing:null, distance:null, heading:null, active:false, listener:null};

// ===== إشعارات =====
const canNotify = ()=> 'Notification' in window;
const notifyOn = ()=> LS.g('mizan_notify_enabled')==='true';
async function reqNotify(){
  if(!canNotify()) return alert('المتصفح لا يدعم الإشعارات');
  if(!window.isSecureContext) return alert('لازم https');
  let p=await Notification.requestPermission();
  if(p==='granted'){
    LS.s('mizan_notify_enabled','true');
    navigator.vibrate?.([100,50,100]);
    alert('✅ تم تفعيل الإشعارات');
    sendNotify('Dhuhr');
    render(); updNotifyUI();
  }else alert('❌ تم رفض الإشعارات');
}
async function sendNotify(en){
  if(!canNotify()||Notification.permission!=='granted'||!notifyOn()||LS.g(`notify-${en}`)==='false') return;
  let reg=await navigator.serviceWorker.ready;
  reg.showNotification(`حان وقت صلاة ${P_AR[en]}`,{
    body:`حان الآن موعد أذان ${P_AR[en]} - ${$('hijriDateDisplay')?.innerText||''}`,
    icon:'./icons/icon-192.png',badge:'./icons/icon-72.png',
    vibrate:[200,100,200,100,200],requireInteraction:true,
    tag:`prayer-${en}-${new Date().toDateString()}`,data:{prayer:en}
  });
}
function checkNotify(curMins){
  if(!prayerTimes||!notifyOn()||Notification.permission!=='granted') return;
  let today=new Date().toDateString();
  if(LS.g('mizan_notify_date')!==today){
    notifiedCache={}; LS.s('mizan_notify_date',today); LS.s('mizan_notified_today',{});
  }
  for(let [en,t] of Object.entries(prayerTimes)){
    if(!t||en==='Sunrise') continue;
    let [h,m]=t.split(':').map(Number), pm=h*60+m;
    if(curMins===pm){
      let k=`${today}_${en}`;
      if(!notifiedCache[k]){sendNotify(en); notifiedCache[k]=1; LS.s('mizan_notified_today',notifiedCache)}
    }
  }
}

// ===== وقت الصلاة =====
const addMins=(s,a)=>{if(!s||!s.includes(':'))return s; let [h,m]=s.split(':').map(Number); let d=new Date(); d.setHours(h,m+a,0,0); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
const applyTimes=(times)=>{
  prayerTimes=times;
  ['fajr','dhuhr','asr','maghrib','isha'].forEach(k=>{
    let id=`t-${k}`, en={fajr:'Fajr',dhuhr:'Dhuhr',asr:'Asr',maghrib:'Maghrib',isha:'Isha'}[k];
    let el=$(id); if(el&&times[en]) el.innerText=to12(times[en]);
  });
  if(window.prayerInt) clearInterval(window.prayerInt);
  window.prayerInt=setInterval(tick,1000); tick();
  // تحديث القبلة أيضاً عند تغير الموقع
  if(activeTab==='qibla') updateQiblaUI();
};
const to12=t=>{if(!t)return'--:--'; let [h,m]=t.split(':').map(Number), s=h>=12?'م':'ص'; h=h%12||12; return `${h}:${m.toString().padStart(2,'0')} ${s}`};

function fetchTimes(lat,lng,isPrecise=false,offlineMode=false){
  if(offlineMode||!navigator.onLine){
    let astro=new AstroPrayer(lat,lng,3);
    let calc=astro.calc(new Date());
    LS.s('mizan_cached_timings',{timings:calc,lat,lng,isPrecise,date:new Date().toLocaleDateString(),ts:Date.now(),src:'astro'});
    applyTimes(calc);
    $('locStatus')&&( $('locStatus').innerText = isPrecise?`موقعك المحفوظ (فلكي بدون نت)`: `النجف الأشرف (فلكي بدون نت)` );
    return;
  }
  let ts=Math.floor(Date.now()/1000);
  fetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=0`)
  .then(r=>r.json()).then(d=>{
    let raw=d.data.timings;
    let final={
      Fajr:addMins(raw.Sunrise,-60),
      Dhuhr:addMins(raw.Dhuhr,10),
      Asr:addMins(raw.Asr,10),
      Maghrib:addMins(raw.Maghrib,10),
      Isha:addMins(raw.Isha,5),
      Sunrise:raw.Sunrise
    };
    LS.s('mizan_cached_timings',{timings:final,lat,lng,isPrecise,date:new Date().toLocaleDateString(),ts:Date.now(),src:'api'});
    applyTimes(final);
  }).catch(_=>{
    let astro=new AstroPrayer(lat,lng,3);
    let calc=astro.calc(new Date());
    applyTimes(calc);
    $('nextPrayerCounter').innerText='بدون نت - حساب فلكي دقيق';
    $('locStatus').innerText=isPrecise?'موقعك (فلكي)':'النجف الأشرف (فلكي)';
  });
}

function initPrayer(){
  $('hijriDateDisplay').innerText=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-civil',{day:'numeric',month:'long',year:'numeric'}).format(Date.now());
  updOffline(); 
  let loc=LS.j('mizan_last_loc');
  if(!navigator.onLine){
    let cache=LS.j('mizan_cached_timings');
    if(cache?.timings){applyTimes(cache.timings); $('locStatus').innerText=cache.isPrecise?'موقعك المحفوظ (بدون نت)':'النجف الأشرف (بدون نت)'; return}
  }
  if(loc){fetchTimes(loc.lat,loc.lng,true); $('locStatus').innerText=`موقعك: ${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`}
  else{fetchTimes(NAJAF.lat,NAJAF.lng,false); $('locStatus').innerText='الافتراضي: النجف الأشرف';}
  updNotifyUI();
  updateQiblaUI();
}
function updOffline(){let el=$('offlineIndicator'); if(!el)return; el.style.display=navigator.onLine?'none':'block'; el.innerText=navigator.onLine?'':'📴 بدون نت - حساب فلكي دقيق'; let cs=$('connStatus'); if(cs) cs.innerText=navigator.onLine?'متصل':'غير متصل (فلكي)';}
function updNotifyUI(){let el=$('notifyStatus'); if(!el)return; el.innerText=(Notification.permission==='granted'&&notifyOn())?'✅ مفعلة':'🔕 غير مفعلة'; el.style.color=(Notification.permission==='granted'&&notifyOn())?'#2ecc71':'#999'}
function requestLocation(){
  let c=$('nextPrayerCounter'), s=$('locStatus');
  if(!window.isSecureContext) return alert('لازم https');
  if(!navigator.geolocation) return s.innerText='المتصفح لا يدعم الموقع';
  c.innerText='جاري تحديد موقعك...'; s.innerText='يرجى الموافقة';
  navigator.geolocation.getCurrentPosition(pos=>{
    let {latitude:lat,longitude:lng}=pos.coords;
    LS.s('mizan_last_loc',{lat,lng}); s.innerText='تم ✓'; fetchTimes(lat,lng,true); navigator.vibrate?.(50); updateQiblaUI();
  },err=>{
    s.innerText=err.code===1?'رفض الإذن - فعل GPS':err.code===2?'تعذر التحديد':'انتهى الوقت';
    c.innerText='فشل التحديد';
    if(err.code===3) navigator.geolocation.getCurrentPosition(p=>{let {latitude:lat,longitude:lng}=p.coords; LS.s('mizan_last_loc',{lat,lng}); fetchTimes(lat,lng,true); updateQiblaUI()},()=>fetchTimes(NAJAF.lat,NAJAF.lng,false),{enableHighAccuracy:false,timeout:1e4,maximumAge:6e4});
  },{enableHighAccuracy:true,timeout:15e3,maximumAge:0});
}
function tick(){
  if(!prayerTimes) return;
  let now=new Date(), cur=now.getHours()*60+now.getMinutes();
  let toM=t=>{let [h,m]=t.split(':').map(Number); return h*60+m};
  let order=[['Fajr','الصبح'],['Dhuhr','الظهر'],['Asr','العصر'],['Maghrib','المغرب'],['Isha','العشاء']].map(([en,ar])=>({en,ar,m:toM(prayerTimes[en]||'00:00')})).filter(x=>!isNaN(x.m)).sort((a,b)=>a.m-b.m);
  if(!order.length) return;
  let next=order.find(o=>cur<o.m) || {...order[0],m:order[0].m+1440};
  let diff=next.m-cur; if(diff<0) diff+=1440;
  let el=$('nextPrayerCounter');
  if(el && !el.innerText.includes('عدم الاتصال')) el.innerText=`باقي على ${next.ar}: ${Math.floor(diff/60)}س ${diff%60}د`;
  checkNotify(cur);
}
function togglePrayerMenu(){let m=$('prayerMenu'); m.style.display=m.style.display==='block'?'none':'block'}

// ===== القبلة =====
function getPosForQibla(){return LS.j('mizan_last_loc') || NAJAF}
function updateQiblaUI(){
  let pos=getPosForQibla();
  let b=qiblaEngine.bearing(pos.lat,pos.lng);
  let d=qiblaEngine.distance(pos.lat,pos.lng);
  qiblaState.bearing=b; qiblaState.distance=d;
  // تحديث النصوص إذا موجودة
  let bEl=$('qiblaBearing'), dEl=$('qiblaDistance'), dirEl=$('qiblaDir'), locEl=$('qiblaLoc');
  if(bEl) bEl.innerText=`${b.toFixed(1)}°`;
  if(dEl) dEl.innerText=`${d.toFixed(0)} كم`;
  if(dirEl) dirEl.innerText=qiblaEngine.directionText(b);
  if(locEl) locEl.innerText=LS.j('mizan_last_loc')?`موقعك: ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`:`النجف الأشرف (افتراضي)`;
  // تحديث سهم البوصلة الثابت
  let arrow=$('qiblaArrow');
  if(arrow && !qiblaState.active){
    arrow.style.transform=`translate(-50%, -100%) rotate(${b}deg)`;
  }
}
function startQiblaCompass(){
  let btn=$('qiblaCompassBtn');
  if(qiblaState.active){stopQiblaCompass(); return}
  // iOS 13+ يحتاج إذن
  if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function'){
    DeviceOrientationEvent.requestPermission().then(state=>{
      if(state==='granted'){initCompassListener();}else{alert('يجب السماح بالوصول للبوصلة من الإعدادات')}
    }).catch(()=>alert('المتصفح لا يدعم البوصلة'));
  }else{
    initCompassListener();
  }
  function initCompassListener(){
    qiblaState.active=true;
    if(btn) btn.innerText='⏹ إيقاف البوصلة';
    let hint=$('qiblaHint'); if(hint) hint.innerText='حرك الهاتف - السهم يشير للقبلة';
    // مستمع اتجاه الجهاز
    let handler=e=>{
      let heading=null;
      if(e.webkitCompassHeading!==undefined){ // iOS
        heading=e.webkitCompassHeading;
      }else if(e.alpha!==null){
        // Android: alpha 0-360, مع تصحيح
        heading=360-e.alpha;
        // تصحيح حسب screen orientation
        if(window.screen && window.screen.orientation){
          let angle=window.screen.orientation.angle||0;
          heading=(heading+angle)%360;
        }
      }
      if(heading==null) return;
      qiblaState.heading=heading;
      updateCompassVisual();
    };
    qiblaState.listener=handler;
    window.addEventListener('deviceorientation', handler, true);
    // مطلوب لتفعيل على بعض المتصفحات
    window.addEventListener('deviceorientationabsolute', handler, true);
  }
}
function stopQiblaCompass(){
  qiblaState.active=false;
  if(qiblaState.listener){
    window.removeEventListener('deviceorientation', qiblaState.listener, true);
    window.removeEventListener('deviceorientationabsolute', qiblaState.listener, true);
    qiblaState.listener=null;
  }
  let btn=$('qiblaCompassBtn'); if(btn) btn.innerText='🧭 تفعيل البوصلة الحية';
  let hint=$('qiblaHint'); if(hint) hint.innerText='ثبت الهاتف على سطح مستوٍ بعيداً عن المعادن';
  // إعادة السهم للوضع الثابت
  updateQiblaUI();
}
function updateCompassVisual(){
  if(qiblaState.bearing==null||qiblaState.heading==null) return;
  let rose=$('compassRose'), arrow=$('qiblaArrow');
  if(!rose||!arrow) return;
  // الوردة تدور عكس اتجاه الجهاز ليبقى الشمال ثابت
  rose.style.transform=`rotate(${-qiblaState.heading}deg)`;
  // السهم يشير للقبلة بالنسبة للشمال الحقيقي
  // عندما الوردة تدور -heading، السهم يجب أن يكون في زاوية bearing
  // لكن إذا أردنا سهم يتحرك ليوضح أين تتجه، نستخدم bearing - heading
  let relative = qiblaState.bearing - qiblaState.heading;
  // للعرض الثابت للقبلة داخل البوصلة:
  arrow.style.transform=`translate(-50%, -100%) rotate(${relative}deg)`;
  // تحديث نص الانحراف
  let diffEl=$('qiblaDiff');
  if(diffEl){
    let diff = ((relative+540)%360)-180; // من -180 إلى 180
    if(Math.abs(diff)<3) diffEl.innerText='✅ أنت باتجاه القبلة الآن';
    else if(diff>0) diffEl.innerText=`➡️ انحرف ${Math.abs(diff).toFixed(0)}° يميناً`;
    else diffEl.innerText=`⬅️ انحرف ${Math.abs(diff).toFixed(0)}° يساراً`;
    diffEl.style.color=Math.abs(diff)<5?'#2ecc71':'var(--p)';
  }
}

// ===== ميزان =====
function checkDay(){
  let today=new Date().toLocaleDateString(), opts={weekday:'long',year:'numeric',month:'numeric',day:'numeric'};
  $('dateText').innerText=new Date().toLocaleDateString('ar-EG',opts);
  if(db.lastUpdate!==today){db.sins.forEach(i=>i.d=false); db.obeys.forEach(i=>i.d=false); db.lastUpdate=today; sync()}
}
function setTab(t){
  if(activeTab==='qibla'&&t!=='qibla') stopQiblaCompass();
  activeTab=t;
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  $(`tab-${t}`)?.classList.add('active');
  $('fab').style.display=(t==='cfg'||t==='qibla')?'none':'flex';
  render();
}
function render(){
  let list=$('list'); list.innerHTML='';
  if(activeTab==='cfg'){
    let cache=LS.j('mizan_cached_timings');
    list.innerHTML=`
      <div class="item-card col">
        <b>🔔 إشعارات الصلاة</b>
        <div class="row"><button class="btn-save" onclick="reqNotify()">تفعيل الإشعارات</button><span id="notifyStatus" class="notify-status"></span></div>
        <small class="dim">إشعار "حان وقت صلاة..." حتى بدون نت</small>
        <div class="stack">${Object.entries(P_AR).map(([en,ar])=>`<label class="check-row"><span>${ar}</span><input type="checkbox" ${LS.g(`notify-${en}`)!=='false'?'checked':''} onchange="localStorage.setItem('notify-${en}',this.checked)"></label>`).join('')}</div>
        <button onclick="sendNotify('Dhuhr')" class="btn-cancel">▶ تجربة إشعار</button>
      </div>
      <div class="item-card col">
        <b>📴 بدون إنترنت - حساب فلكي</b>
        <small class="dim">يحسب الشروق والغروب فلكياً من إحداثياتك. الافتراضي النجف.</small>
        <div class="info-box">
          <div>آخر حساب: ${cache?.date||'لم يحدث'}</div>
          <div>المصدر: ${cache?.src==='api'?'API + تعديلاتك':cache?.src==='astro'?'فلكي دقيق بدون نت':'غير محفوظ'}</div>
          <div>الموقع: ${LS.j('mizan_last_loc')?'محفوظ':'النجف الأشرف'}</div>
          <div>الحالة: <span id="connStatus">${navigator.onLine?'متصل':'غير متصل (فلكي)'}</span></div>
          <div>الفجر: قبل الشروق بـ60د</div>
        </div>
        <div class="row"><button class="btn-cancel" onclick="localStorage.removeItem('mizan_last_loc');alert('تم - سيعود للنجف');location.reload()">🔄 العودة للنجف</button>
        <button class="btn-cancel" onclick="let a=new AstroPrayer((LS.j('mizan_last_loc')||NAJAF).lat,(LS.j('mizan_last_loc')||NAJAF).lng);alert(JSON.stringify(a.calc(),null,2))">🧮 اختبار فلكي</button></div>
      </div>
      <div class="item-card" onclick="exportData()"><b>📥 تصدير نسخة</b></div>
      <div class="item-card" onclick="fullReset()" style="color:var(--sin-color)"><b>🧹 مسح شامل</b></div>
      <p class="ver">ميزان V7 - قبلة + فلكي - النجف + إشعارات</p>`;
    setTimeout(()=>{updNotifyUI(); updOffline()},100); return;
  }
  if(activeTab==='qibla'){
    let pos=getPosForQibla();
    let bearing=qiblaEngine.bearing(pos.lat,pos.lng);
    let dist=qiblaEngine.distance(pos.lat,pos.lng);
    list.innerHTML=`
      <div class="item-card col">
        <div class="qibla-wrap">
          <div class="compass-box">
            <div id="compassRose" class="compass-rose">
              <div class="compass-marks">
                ${Array.from({length:36}).map((_,i)=>`<span style="transform:translate(-50%,-50%) rotate(${i*10}deg)"></span>`).join('')}
              </div>
            </div>
            <div id="qiblaArrow" class="qibla-arrow"></div>
            <div class="compass-center"></div>
          </div>
          <div id="qiblaDiff" class="qibla-hint" style="font-weight:700;color:var(--p)">ثبت الهاتف على سطح مستوٍ</div>
          <div class="qibla-info">
            <div class="qibla-stat"><span>اتجاه القبلة</span><b id="qiblaBearing">${bearing.toFixed(1)}°</b></div>
            <div class="qibla-stat"><span>الاتجاه</span><b id="qiblaDir">${qiblaEngine.directionText(bearing)}</b></div>
            <div class="qibla-stat"><span>المسافة للكعبة</span><b id="qiblaDistance">${dist.toFixed(0)} كم</b></div>
            <div class="qibla-stat"><span>موقعك الحالي</span><b id="qiblaLoc" style="font-size:11px">${LS.j('mizan_last_loc')?`${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`:'النجف الأشرف (افتراضي)'}</b></div>
          </div>
          <button id="qiblaCompassBtn" class="qibla-btn" onclick="startQiblaCompass()">🧭 تفعيل البوصلة الحية</button>
          <small id="qiblaHint" class="qibla-hint">اضغط تفعيل البوصلة وامنح الإذن، ثم حرك الهاتف حتى يصبح السهم للأعلى. أبعد الهاتف عن المعادن والمغناطيس.</small>
          <small class="dim" style="text-align:center">الحساب فلكي دقيق 100% بدون نت - يستخدم موقعك المحفوظ أو النجف افتراضياً<br>الكعبة: 21.4225°N, 39.8262°E</small>
        </div>
      </div>
      <div class="item-card col">
        <b>ℹ️ كيف أحدد القبلة بدقة؟</b>
        <small class="dim" style="line-height:1.8">
          1. فعل GPS واحفظ موقعك من الأعلى<br>
          2. ضع الهاتف على سطح مستوٍ بعيداً عن الحديد<br>
          3. فعل البوصلة الحية<br>
          4. دور حتى يصبح السهم يشير للأعلى ويظهر "أنت باتجاه القبلة"<br>
          5. بدون حساس، استخدم الاتجاه الرقمي: ${bearing.toFixed(1)}° من الشمال باتجاه عقارب الساعة
        </small>
      </div>
    `;
    // تهيئة أولية
    setTimeout(()=>{updateQiblaUI();},100);
    return;
  }
  db[activeTab].forEach((it,i)=>{
    let card=document.createElement('div'); card.className=`item-card ${it.d?'done':''}`;
    let cls=it.d?(activeTab==='sins'?'active-s':'active-o'):'', mark=it.d?(activeTab==='sins'?'✕':'✓'):'';
    card.innerHTML=`<div class="item-info"><b>${it.n}</b><span>${it.nt||'لا ملاحظات'}</span></div><div class="btns"><button class="btn btn-note" onclick="openEdit(${i})">📝</button><button class="btn btn-check ${cls}" onclick="toggleItem(${i})">${mark}</button></div>`;
    list.appendChild(card);
  }); updProgress();
}
const toggleItem=i=>{db[activeTab][i].d=!db[activeTab][i].d; navigator.vibrate?.(15); sync(); render()};
function updProgress(){let s=db.sins.filter(x=>x.d).length,o=db.obeys.filter(x=>x.d).length,p=Math.min(100,Math.max(5,50+o*8-s*10)); let b=$('pBar'); if(b){b.style.width=p+'%'; b.style.background=p<45?'var(--sin-color)':p>55?'var(--obey-color)':'var(--primary)'}}
function openAdd(){editIdx=null; $('mTitle').innerText='إضافة عمل'; $('mName').value=''; $('mNote').value=''; $('deleteBtn').style.display='none'; $('overlay').style.display='flex'}
function openEdit(i){editIdx=i; let it=db[activeTab][i]; $('mTitle').innerText='تعديل'; $('mName').value=it.n; $('mNote').value=it.nt; $('deleteBtn').style.display='block'; $('overlay').style.display='flex'}
function saveData(){let n=$('mName').value.trim(), nt=$('mNote').value.trim(); if(!n)return; if(editIdx!==null){db[activeTab][editIdx].n=n; db[activeTab][editIdx].nt=nt}else db[activeTab].push({n,d:false,nt}); sync(); closeModal(); render()}
function deleteCurrent(){if(confirm('حذف؟')){db[activeTab].splice(editIdx,1); sync(); closeModal(); render()}}
const closeModal=()=>$('overlay').style.display='none';
const sync=()=>LS.s('mizan_pro_v5',db);
const exportData=()=>{let a=document.createElement('a'); a.href='data:text/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(db)); a.download='mizan_backup.json'; a.click()};
const fullReset=()=>{if(confirm('مسح كل شيء؟')){localStorage.clear(); location.reload()}};
const requestPrayerNotifications=reqNotify, sendPrayerNotification=sendNotify, requestLocation=requestLocation;

window.addEventListener('online',()=>{updOffline(); initPrayer()});
window.addEventListener('offline',updOffline);
window.onload=()=>{checkDay(); render(); initPrayer()};
