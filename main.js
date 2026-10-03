// ميزان V12 CLEAN - تصميم نظيف أصلي + إشعارات تعمل
const $ = id=>document.getElementById(id);
const LS = {
  j:k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},
  g:(k,d=null)=>localStorage.getItem(k)??d,
  s:(k,v)=>localStorage.setItem(k, typeof v==='object'?JSON.stringify(v):v)
};
const NAJAF = {lat:32.0273,lng:44.3393};
const KAABA = {lat:21.422507,lng:39.826209};
const P_AR = {Fajr:'الفجر',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};

let db = LS.j('mizan_pro_v5') || {sins:[{n:"الغيبة",d:false,nt:""}],obeys:[{n:"الصلوات الخمس",d:false,nt:""}],lastUpdate:new Date().toLocaleDateString()};
let activeTab='sins', editIdx=null, prayerTimes=null;
let notifiedCache = LS.j('mizan_notified_today') || {};

class AstroPrayer{
  constructor(lat,lng,tz=3){this.lat=lat;this.lng=lng;this.tz=tz;this.D2R=Math.PI/180;this.R2D=180/Math.PI}
  fixA(a){a%=360;return a<0?a+360:a}
  fixH(h){h%=24;return h<0?h+24:h}
  julian(d){let y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();if(m<=2){y--;m+=12}let A=Math.floor(y/100),B=2-A+Math.floor(A/4);return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+day+B-1524.5}
  sunPos(jd){let D=jd-2451545.0;let g=this.fixA(357.529+0.98560028*D);let q=this.fixA(280.459+0.98564736*D);let L=this.fixA(q+1.915*Math.sin(g*this.D2R)+0.02*Math.sin(2*g*this.D2R));let e=23.439-0.00000036*D;let RA=Math.atan2(Math.cos(e*this.D2R)*Math.sin(L*this.D2R),Math.cos(L*this.D2R))*this.R2D;RA=this.fixA(RA);let decl=Math.asin(Math.sin(e*this.D2R)*Math.sin(L*this.D2R))*this.R2D;let eqt=q/15-this.fixA(RA)/15;return{decl,eqt}}
  midDay(jd){let s=this.sunPos(jd);return this.fixH(12+this.tz-this.lng/15-s.eqt)}
  sunAngleTime(angle,jd,isMorning=true){let s=this.sunPos(jd);let noon=this.midDay(jd);let cosH=(Math.sin(-angle*this.D2R)-Math.sin(this.lat*this.D2R)*Math.sin(s.decl*this.D2R))/(Math.cos(this.lat*this.D2R)*Math.cos(s.decl*this.D2R));if(cosH<-1||cosH>1)return null;let H=Math.acos(cosH)*this.R2D/15;return isMorning?noon-H:noon+H}
  asrTime(factor,jd){let s=this.sunPos(jd);let delta=Math.abs(this.lat-s.decl);let cot=factor+Math.tan(delta*this.D2R);let angle=Math.atan(1/cot)*this.R2D;return this.sunAngleTime(90-angle,jd,false)}
  toHM(f){if(f==null)return null;f=this.fixH(f);let h=Math.floor(f),m=Math.round((f-h)*60);if(m>=60){h++;m-=60}if(h>=24)h-=24;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
  calc(date=new Date()){let jd=this.julian(date);let sunriseF=this.sunAngleTime(0.833,jd,true);let sunsetF=this.sunAngleTime(0.833,jd,false);let dhuhrF=this.midDay(jd);let asrF=this.asrTime(1,jd);const addM=(f,m)=>f==null?null:f+m/60;return{Fajr:this.toHM(addM(sunriseF,-60)),Dhuhr:this.toHM(addM(dhuhrF,10)),Asr:this.toHM(addM(asrF,10)),Maghrib:this.toHM(addM(sunsetF,10)),Isha:this.toHM(addM(sunsetF+1.5,5)),Sunrise:this.toHM(sunriseF)}}
}
class QiblaEngine{
  constructor(){this.D2R=Math.PI/180;this.R2D=180/Math.PI}
  bearing(lat,lng){let φ1=lat*this.D2R,λ1=lng*this.D2R,φ2=KAABA.lat*this.D2R,λ2=KAABA.lng*this.D2R;let Δλ=λ2-λ1;let y=Math.sin(Δλ)*Math.cos(φ2);let x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);return (Math.atan2(y,x)*this.R2D+360)%360}
  distance(lat,lng){let φ1=lat*this.D2R,φ2=KAABA.lat*this.D2R;let Δφ=(KAABA.lat-lat)*this.D2R,Δλ=(KAABA.lng-lng)*this.D2R;let a=Math.sin(Δφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
  directionText(b){if(b>=337.5||b<22.5)return 'شمال';if(b<67.5)return 'شمال شرقي';if(b<112.5)return 'شرق';if(b<157.5)return 'جنوب شرقي';if(b<202.5)return 'جنوب';if(b<247.5)return 'جنوب غربي';if(b<292.5)return 'غرب';return 'شمال غربي'}
}
const qiblaEngine = new QiblaEngine();
let qiblaState = {bearing:null,distance:null,heading:null,active:false,listener:null};

// === إشعارات - مصلحة 100% - طريقة Service Worker فقط ===
function canNotify(){return 'Notification' in window}
function notifyOn(){return LS.g('mizan_notify_enabled')==='true'}

async function doRequestNotify(){
  if(!canNotify()){alert('المتصفح لا يدعم الإشعارات');return}
  try{
    let perm = await Notification.requestPermission();
    if(perm==='granted'){
      LS.s('mizan_notify_enabled','true');
      alert('✅ تم تفعيل الإشعارات');
      render(); updNotifyUI();
      setTimeout(()=>testNotification(),800);
    }else{
      alert('❌ تم رفض الإشعارات - فعلها من إعدادات المتصفح');
    }
  }catch(e){alert('خطأ: '+e.message)}
}

async function testNotification(){
  if(!canNotify()){alert('المتصفح لا يدعم');return}
  let perm = Notification.permission;
  if(perm!=='granted'){
    perm = await Notification.requestPermission();
    if(perm!=='granted'){alert('يجب السماح بالإشعارات');return}
  }
  try{
    let reg = await navigator.serviceWorker.ready;
    await reg.showNotification('🕌 ميزان المحاسبة', {
      body: 'الإشعارات تعمل بنجاح ✅',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200,100,200],
      tag: 'test'
    });
  }catch(e){
    alert('فشل الإشعار: '+e.message);
  }
}

async function doSendNotify(en){
  if(!canNotify())return;
  if(Notification.permission!=='granted')return;
  if(!notifyOn())return;
  if(LS.g('notify-'+en)==='false')return;
  try{
    let reg = await navigator.serviceWorker.ready;
    await reg.showNotification('حان وقت صلاة '+P_AR[en], {
      body: 'حان الآن موعد الأذان',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [300,100,300],
      tag: 'prayer-'+en
    });
  }catch(e){}
}

function checkNotify(curMins){
  if(!prayerTimes||!notifyOn()||Notification.permission!=='granted')return;
  let today=new Date().toDateString();
  if(LS.g('mizan_notify_date')!==today){notifiedCache={};LS.s('mizan_notify_date',today);LS.s('mizan_notified_today',{});}
  for(let [en,t] of Object.entries(prayerTimes)){
    if(!t||en==='Sunrise')continue;
    let [h,m]=t.split(':').map(Number);if(isNaN(h))continue;
    if(curMins===h*60+m){
      let k=today+'_'+en;
      if(!notifiedCache[k]){doSendNotify(en);notifiedCache[k]=1;LS.s('mizan_notified_today',notifiedCache);}
    }
  }
}

// === باقي الوظائف ===
function addMins(s,m){if(!s||!s.includes(':'))return s;let [h,mi]=s.split(':').map(Number);let d=new Date();d.setHours(h,mi+m,0,0);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function to12(t){if(!t||!t.includes(':'))return '--:--';let [h,m]=t.split(':').map(Number);let suf=h>=12?'م':'ص';h=h%12||12;return `${h}:${String(m).padStart(2,'0')} ${suf}`}
function applyTimes(times){if(!times)return;prayerTimes=times;const map={fajr:'Fajr',dhuhr:'Dhuhr',asr:'Asr',maghrib:'Maghrib',isha:'Isha'};Object.entries(map).forEach(([k,en])=>{let el=$(`t-${k}`);if(el&&times[en])el.innerText=to12(times[en])});if(window.prayerInt)clearInterval(window.prayerInt);window.prayerInt=setInterval(tick,1000);tick()}
function fetchTimes(lat,lng,isPrecise=false,forceOffline=false){
  if(forceOffline||!navigator.onLine){let astro=new AstroPrayer(lat,lng,3);let calc=astro.calc(new Date());LS.s('mizan_cached_timings',{timings:calc,lat,lng,isPrecise,date:new Date().toLocaleDateString(),ts:Date.now(),src:'astro'});applyTimes(calc);let ls=$('locStatus');if(ls)ls.innerText=isPrecise?'موقعك المحفوظ (فلكي بدون نت)':'النجف الأشرف (فلكي بدون نت)';return}
  let ts=Math.floor(Date.now()/1000);
  fetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=0`).then(r=>r.json()).then(d=>{if(!d||!d.data||!d.data.timings)throw 0;let raw=d.data.timings;let final={Fajr:addMins(raw.Sunrise,-60),Dhuhr:addMins(raw.Dhuhr,10),Asr:addMins(raw.Asr,10),Maghrib:addMins(raw.Maghrib,10),Isha:addMins(raw.Isha,5),Sunrise:raw.Sunrise};LS.s('mizan_cached_timings',{timings:final,lat,lng,isPrecise,date:new Date().toLocaleDateString(),ts:Date.now(),src:'api'});applyTimes(final)}).catch(()=>{let astro=new AstroPrayer(lat,lng,3);applyTimes(astro.calc(new Date()))});
}
function initPrayer(){
  try{let hijri=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-civil',{day:'numeric',month:'long',year:'numeric'}).format(Date.now());$('hijriDateDisplay').innerText=hijri}catch{$('hijriDateDisplay').innerText=new Date().toLocaleDateString('ar-IQ')}
  updOffline();
  let loc=LS.j('mizan_last_loc');
  if(!navigator.onLine){let cache=LS.j('mizan_cached_timings');if(cache&&cache.timings){applyTimes(cache.timings);return}}
  if(loc&&typeof loc.lat==='number'){fetchTimes(loc.lat,loc.lng,true);$('locStatus').innerText=`موقعك: ${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`}else{fetchTimes(NAJAF.lat,NAJAF.lng,false);$('locStatus').innerText='الافتراضي: النجف الأشرف'}
  updNotifyUI();
}
function updOffline(){let el=$('offlineIndicator');if(!el)return;if(!navigator.onLine){el.textContent='📴 بدون نت - حساب فلكي';el.style.display='block'}else el.style.display='none'}
function updNotifyUI(){let el=$('notifyStatus');if(!el)return;el.textContent=Notification.permission==='granted'&&notifyOn()?'✅ مفعلة':'🔕 غير مفعلة';el.style.color=Notification.permission==='granted'&&notifyOn()?'#2ecc71':'#aaa'}
function doRequestLocation(){
  if(!window.isSecureContext){alert('الموقع يحتاج https');return}
  if(!navigator.geolocation){$('locStatus').textContent='لا يدعم الموقع';return}
  $('nextPrayerCounter').textContent='جاري تحديد موقعك...';
  navigator.geolocation.getCurrentPosition(pos=>{let {latitude:lat,longitude:lng}=pos.coords;LS.s('mizan_last_loc',{lat,lng});$('locStatus').textContent='تم ✓';fetchTimes(lat,lng,true);updateQiblaUI()},()=>{fetchTimes(NAJAF.lat,NAJAF.lng,false)}, {enableHighAccuracy:true,timeout:15000});
}
function tick(){
  if(!prayerTimes)return;
  let now=new Date(),cur=now.getHours()*60+now.getMinutes();
  let toM=t=>{if(!t||!t.includes(':'))return NaN;let [h,m]=t.split(':').map(Number);return h*60+m};
  let order=[['Fajr','الصبح'],['Dhuhr','الظهر'],['Asr','العصر'],['Maghrib','المغرب'],['Isha','العشاء']].map(([en,ar])=>({en,ar,m:toM(prayerTimes[en])})).filter(x=>!isNaN(x.m)).sort((a,b)=>a.m-b.m);
  if(!order.length)return;
  let next=order.find(o=>cur<o.m)||{...order[0],m:order[0].m+1440};
  let diff=next.m-cur;if(diff<0)diff+=1440;
  $('nextPrayerCounter').textContent=`باقي على ${next.ar}: ${Math.floor(diff/60)}س ${diff%60}د`;
  checkNotify(cur);
}
function togglePrayerMenu(){let m=$('prayerMenu');if(!m)return;m.style.display=m.style.display==='block'?'none':'block'}
function getPosForQibla(){return LS.j('mizan_last_loc')||NAJAF}
function updateQiblaUI(){
  let pos=getPosForQibla();let b=qiblaEngine.bearing(pos.lat,pos.lng);let d=qiblaEngine.distance(pos.lat,pos.lng);
  qiblaState.bearing=b;qiblaState.distance=d;
  let bEl=$('qiblaBearing'),dEl=$('qiblaDistance'),dirEl=$('qiblaDir'),locEl=$('qiblaLoc');
  if(bEl)bEl.textContent=`${b.toFixed(1)}°`;if(dEl)dEl.textContent=`${d.toFixed(0)} كم`;if(dirEl)dirEl.textContent=qiblaEngine.dirText(b);if(locEl)locEl.textContent=LS.j('mizan_last_loc')?`${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`:'النجف الأشرف';
  let arrow=$('qiblaArrow');if(arrow&&!qiblaState.active)arrow.style.transform=`translate(-50%, -100%) rotate(${b}deg)`;
}
function startQiblaCompass(){
  let btn=$('qiblaCompassBtn');if(qiblaState.active){stopQiblaCompass();return}
  if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){DeviceOrientationEvent.requestPermission().then(s=>{if(s==='granted')initCompass();else alert('يجب السماح للبوصلة')}).catch(()=>alert('لا يدعم البوصلة'))}else initCompass();
  function initCompass(){qiblaState.active=true;if(btn)btn.textContent='⏹ إيقاف';let handler=e=>{let heading=null;if(e.webkitCompassHeading!==undefined)heading=e.webkitCompassHeading;else if(e.alpha!==null){heading=360-e.alpha;if(window.screen?.orientation?.angle)heading=(heading+window.screen.orientation.angle)%360}if(heading==null)return;qiblaState.heading=heading;updateCompassVisual()};qiblaState.listener=handler;window.addEventListener('deviceorientation',handler,true)}
}
function stopQiblaCompass(){
  try{
    qiblaState.active=false;
    if(qiblaState.listener){
      try{
        window.removeEventListener('deviceorientation',qiblaState.listener,true);
        window.removeEventListener('deviceorientationabsolute',qiblaState.listener,true);
      }catch(e){}
      qiblaState.listener=null;
    }
    let btn=$('qiblaCompassBtn');
    if(btn)btn.textContent='🧭 تفعيل البوصلة';
    let hint=$('qiblaHint');
    if(hint)hint.textContent='ثبت الهاتف';
    try{updateQiblaUI();}catch(e){}
  }catch(e){console.log('stopQibla error',e)}
}
function updateCompassVisual(){if(qiblaState.bearing==null||qiblaState.heading==null)return;let rose=$('compassRose'),arrow=$('qiblaArrow');if(!rose||!arrow)return;rose.style.transform=`rotate(${-qiblaState.heading}deg)`;let relative=qiblaState.bearing-qiblaState.heading;arrow.style.transform=`translate(-50%, -100%) rotate(${relative}deg)`;let diffEl=$('qiblaDiff');if(diffEl){let diff=((relative+540)%360)-180;if(Math.abs(diff)<3){diffEl.textContent='✅ أنت باتجاه القبلة';diffEl.style.color='#2ecc71'}else if(diff>0){diffEl.textContent=`➡️ ${Math.abs(diff).toFixed(0)}° يميناً`;diffEl.style.color='#d6c7a1'}else{diffEl.textContent=`⬅️ ${Math.abs(diff).toFixed(0)}° يساراً`;diffEl.style.color='#d6c7a1'}}}
function checkDay(){let today=new Date().toLocaleDateString();let opts={weekday:'long',year:'numeric',month:'numeric',day:'numeric'};let dt=$('dateText');if(dt)dt.textContent=new Date().toLocaleDateString('ar-EG',opts);if(db.lastUpdate!==today){db.sins.forEach(i=>i.d=false);db.obeys.forEach(i=>i.d=false);db.lastUpdate=today;sync()}}
function setTab(t){
  try{
    if(activeTab==='qibla'&&t!=='qibla'){
      try{stopQiblaCompass();}catch(e){console.log('stop compass error',e)}
    }
  }catch(e){}
  activeTab=t;
  try{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    let tabEl=$(`tab-${t}`);
    if(tabEl)tabEl.classList.add('active');
    let fab=$('fab');
    if(fab)fab.style.display=(t==='cfg'||t==='qibla')?'none':'flex';
  }catch(e){console.log('tab UI error',e)}
  try{render();}catch(e){console.error('render error',e); let list=$('list'); if(list) list.innerHTML='<div class="item-card col"><b>حدث خطأ</b><button onclick="location.reload()" class="btn-save">إعادة تحميل</button></div>'}
}
function render(){
  let list=$('list');if(!list)return;list.innerHTML='';
  if(activeTab==='cfg'){
    list.innerHTML=`
      <div class="item-card col">
        <b>🔔 إشعارات الصلاة</b>
        <div class="row"><button onclick="doRequestNotify()" class="btn-save">تفعيل الإشعارات</button><span id="notifyStatus" class="notify-status"></span></div>
        <small class="dim">سيصلك إشعار عند كل أذان</small>
        <div class="stack">${Object.entries(P_AR).map(([en,ar])=>`<label class="check-row"><span>${ar}</span><input type="checkbox" ${LS.g(`notify-${en}`)!=='false'?'checked':''} onchange="localStorage.setItem('notify-${en}',this.checked)"></label>`).join('')}</div>
        <button onclick="testNotification()" class="btn-save" style="margin-top:10px;width:100%">🧪 تجربة إشعار الآن</button>
      </div>
      <div class="item-card col">
        <b>📴 بدون إنترنت</b>
        <small class="dim">يحسب فلكياً من موقعك - الافتراضي النجف</small>
        <div class="row"><button class="btn-cancel" onclick="localStorage.removeItem('mizan_last_loc');alert('تم');location.reload()">🔄 العودة للنجف</button></div>
      </div>
      <div class="item-card" onclick="exportData()"><b>📥 تصدير نسخة</b></div>
      <div class="item-card" onclick="fullReset()" style="color:var(--sin);cursor:pointer;border:1px solid rgba(255,107,107,0.3)"><b>🔄 تهيئة شاملة</b><small class="dim">حذف كل شيء وكأنك تزور أول مرة</small></div>
      <p class="ver">ميزان V12 نظيف - إشعارات تعمل</p>`;
    setTimeout(()=>{updNotifyUI();updOffline()},100);return;
  }
  if(activeTab==='qibla'){
    let pos=getPosForQibla();let bearing=qiblaEngine.bearing(pos.lat,pos.lng);let dist=qiblaEngine.distance(pos.lat,pos.lng);
    list.innerHTML=`
      <div class="item-card-col">
        <div class="qibla-wrap">
          <div class="compass-box"><div id="compassRose" class="compass-rose"><div class="compass-marks">${Array.from({length:36}).map((_,i)=>`<span style="transform:translate(-50%,-50%) rotate(${i*10}deg)"></span>`).join('')}</div></div><div id="qiblaArrow" class="qibla-arrow"></div><div class="compass-center"></div></div>
          <div id="qiblaDiff" class="qibla-hint">ثبت الهاتف</div>
          <div class="qibla-info">
            <div class="qibla-stat"><span>اتجاه القبلة</span><b id="qiblaBearing">${bearing.toFixed(1)}°</b></div>
            <div class="qibla-stat"><span>الاتجاه</span><b id="qiblaDir">${qiblaEngine.directionText(bearing)}</b></div>
            <div class="qibla-stat"><span>المسافة</span><b id="qiblaDistance">${dist.toFixed(0)} كم</b></div>
          </div>
          <button id="qiblaCompassBtn" class="qibla-btn" onclick="startQiblaCompass()">🧭 تفعيل البوصلة</button>
        </div>
      </div>`;
    setTimeout(()=>{updateQiblaUI()},100);return;
  }
  db[activeTab].forEach((it,i)=>{
    let card=document.createElement('div');card.className=`item-card ${it.d?'done':''}`;
    let cls=it.d?(activeTab==='sins'?'active-s':'active-o'):'',mark=it.d?(activeTab==='sins'?'✕':'✓'):'';
    card.innerHTML=`<div class="item-info"><b>${it.n}</b><span>${it.nt||'لا ملاحظات'}</span></div><div class="btns"><button class="btn" onclick="openEdit(${i})">📝</button><button class="btn btn-check ${cls}" onclick="toggleItem(${i})">${mark}</button></div>`;
    list.appendChild(card);
  });updProgress();
}
const toggleItem=i=>{db[activeTab][i].d=!db[activeTab][i].d;sync();render()};
function updProgress(){let s=db.sins.filter(x=>x.d).length,o=db.obeys.filter(x=>x.d).length,p=Math.min(100,Math.max(5,50+o*8-s*10));let b=$('pBar');if(b){b.style.width=p+'%';b.style.background=p<45?'var(--sin)':p>55?'var(--ok)':'var(--p)'}}
function openAdd(){editIdx=null;$('mTitle').innerText='إضافة';$('mName').value='';$('mNote').value='';$('deleteBtn').style.display='none';$('overlay').style.display='flex'}
function openEdit(i){editIdx=i;let it=db[activeTab][i];$('mTitle').innerText='تعديل';$('mName').value=it.n;$('mNote').value=it.nt;$('deleteBtn').style.display='block';$('overlay').style.display='flex'}
function saveData(){let n=$('mName').value.trim(),nt=$('mNote').value.trim();if(!n)return;if(editIdx!==null){db[activeTab][editIdx].n=n;db[activeTab][editIdx].nt=nt}else db[activeTab].push({n,d:false,nt});sync();closeModal();render()}
function deleteCurrent(){if(confirm('حذف؟')){db[activeTab].splice(editIdx,1);sync();closeModal();render()}}
const closeModal=()=>$('overlay').style.display='none';
const sync=()=>LS.s('mizan_pro_v5',db);
const exportData=()=>{let a=document.createElement('a');a.href='data:text/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(db));a.download='mizan_backup.json';a.click()};
async function fullReset(){
  if(!confirm('⚠️ تهيئة شاملة\n\nهل تريد تهيئة التطبيق بالكامل وكأنك تزور الموقع لأول مرة؟\n\nسيتم حذف:\n• كل الذنوب والطاعات\n• موقعك المحفوظ (يعود للنجف)\n• إعدادات الإشعارات\n• كل الكاش والملفات المؤقتة\n• إعدادات القبلة\n\nلا يمكن التراجع!')) return;
  if(!confirm('تأكيد نهائي - هل أنت متأكد من التهيئة الشاملة؟')) return;
  try{
    // 1. مسح localStorage
    localStorage.clear();
    // 2. مسح sessionStorage
    try{sessionStorage.clear();}catch(e){}
    // 3. مسح كل الكاش
    if('caches' in window){
      try{
        let keys = await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }catch(e){console.log('cache clear error',e)}
    }
    // 4. إلغاء تسجيل Service Workers
    if('serviceWorker' in navigator){
      try{
        let regs = await navigator.serviceWorker.getRegistrations();
        for(let r of regs) await r.unregister();
      }catch(e){console.log('sw unregister error',e)}
    }
    // 5. مسح IndexedDB
    try{
      if(window.indexedDB && indexedDB.databases){
        let dbs = await indexedDB.databases();
        for(let db of dbs){ if(db.name) indexedDB.deleteDatabase(db.name); }
      }
    }catch(e){}
    alert('✅ تمت التهيئة الشاملة بنجاح\nسيتم إعادة تحميل التطبيق كأول زيارة');
    // إعادة تحميل قسري مع تجاهل الكاش
    location.reload(true);
    setTimeout(()=>{window.location.href='./?reset='+Date.now()},500);
  }catch(e){
    console.error('reset error',e);
    localStorage.clear();
    alert('تم مسح البيانات - سيتم إعادة التحميل');
    location.reload(true);
  }
}


window.addEventListener('online',()=>{updOffline();initPrayer()});
window.addEventListener('offline',updOffline);
window.onload=()=>{checkDay();render();initPrayer()};
