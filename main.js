let db = JSON.parse(localStorage.getItem('mizan_pro_v5')) || {
    sins: [{n:"الغيبة", d:false, nt:""}],
    obeys: [{n:"الصلوات الخمس", d:false, nt:""}],
    lastUpdate: new Date().toLocaleDateString()
};
let activeTab = 'sins';
let editIdx = null;
let prayerTimes = null;
const DEFAULT_COORDS = { lat: 31.8481, lng: 46.0664 };
let currentLat = DEFAULT_COORDS.lat;
let currentLng = DEFAULT_COORDS.lng;
let currentHeading = 0;
let qiblaAngleGlobal = 0;
let calibrationOffset = parseInt(localStorage.getItem('mizan_compass_calibration') || '0');

function addMinutes(timeStr, minsToAdd) {
    let [h, m] = timeStr.split(':').map(Number);
    let date = new Date();
    date.setHours(h, m + minsToAdd, 0, 0);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function formatTime24(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function calculateSunTimes(lat, lng, date) {
    try {
        const year = date.getFullYear();
        const startOfYear = new Date(year, 0, 0);
        const N = Math.floor((date - startOfYear) / 86400000);
        const lngHour = lng / 15;
        const latRad = lat * Math.PI / 180;
        const B = (360 / 365 * (N - 81)) * Math.PI / 180;
        const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
        const declination = 23.45 * Math.sin((360 / 365 * (284 + N)) * Math.PI / 180) * Math.PI / 180;
        const tzOffset = -date.getTimezoneOffset() / 60;
        let solarNoon = 12 + (tzOffset - lngHour) - EoT / 60;
        solarNoon = ((solarNoon % 24) + 24) % 24;
        let cosH = -Math.tan(latRad) * Math.tan(declination);
        if (cosH > 1) cosH = 1; if (cosH < -1) cosH = -1;
        const H = Math.acos(cosH) * 180 / Math.PI / 15;
        function hoursToDate(base, hours) {
            const h = Math.floor(hours); const m = Math.floor((hours - h) * 60);
            const s = Math.floor(((hours - h) * 60 - m) * 60);
            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0);
            d.setHours(h, m, s, 0); return d;
        }
        const baseDate = new Date(year, date.getMonth(), date.getDate());
        return {
            sunrise: hoursToDate(baseDate, solarNoon - H),
            sunset: hoursToDate(baseDate, solarNoon + H),
            solarNoon: hoursToDate(baseDate, solarNoon)
        };
    } catch (e) { return null; }
}
function initPrayerService() {
    updateHijriDate();
    const cached = JSON.parse(localStorage.getItem('mizan_last_loc') || 'null');
    if (cached && cached.lat && cached.lng) {
        currentLat = cached.lat; currentLng = cached.lng;
        fetchPrayerTimes(cached.lat, cached.lng, true);
    } else {
        fetchPrayerTimes(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng, false);
    }
    const calSlider = document.getElementById('calibrationSlider');
    if (calSlider) calSlider.value = calibrationOffset;
    updateQiblaAngle(currentLat, currentLng);
}
function requestLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentLat = pos.coords.latitude; currentLng = pos.coords.longitude;
            localStorage.setItem('mizan_last_loc', JSON.stringify({ lat: currentLat, lng: currentLng }));
            fetchPrayerTimes(currentLat, currentLng, true);
        },
        () => fetchPrayerTimes(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng, false),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}
function updateHijriDate() {
    try {
        const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-civil', { day: 'numeric', month: 'long', year: 'numeric' }).format(Date.now());
        document.getElementById('hijriDateDisplay').innerText = hijri;
    } catch (e) {
        document.getElementById('hijriDateDisplay').innerText = new Date().toLocaleDateString('ar-EG');
    }
}
function fetchPrayerTimes(lat, lng, isPrecise) {
    currentLat = lat; currentLng = lng;
    const today = new Date();
    const sunTimes = calculateSunTimes(lat, lng, today);
    if (!sunTimes) return;
    const fajrDate = new Date(sunTimes.sunrise.getTime() - 60 * 60 * 1000);
    const dhuhrDate = new Date(sunTimes.solarNoon.getTime() + 10 * 60 * 1000);
    const maghribDate = new Date(sunTimes.sunset.getTime() + 10 * 60 * 1000);
    prayerTimes = {
        Fajr: formatTime24(fajrDate), Dhuhr: formatTime24(dhuhrDate), Maghrib: formatTime24(maghribDate),
        Sunrise: formatTime24(sunTimes.sunrise), Sunset: formatTime24(sunTimes.sunset),
        _dates: { Fajr: fajrDate, Dhuhr: dhuhrDate, Maghrib: maghribDate, sunrise: sunTimes.sunrise, sunset: sunTimes.sunset, solarNoon: sunTimes.solarNoon }
    };
    document.getElementById('t-fajr').innerText = convertTime(prayerTimes.Fajr);
    document.getElementById('t-sunrise').innerText = convertTime(prayerTimes.Sunrise);
    document.getElementById('t-dhuhr').innerText = convertTime(prayerTimes.Dhuhr);
    document.getElementById('t-maghrib').innerText = convertTime(prayerTimes.Maghrib);
    document.getElementById('t-sunset').innerText = convertTime(prayerTimes.Sunset);
    updateQiblaAngle(lat, lng);
    if (window.prayerInterval) clearInterval(window.prayerInterval);
    window.prayerInterval = setInterval(updateCountdown, 1000);
    updateCountdown();
}
function convertTime(time24) {
    let [h, m] = time24.split(':'); h = parseInt(h);
    const suffix = h >= 12? 'م' : 'ص'; h = h % 12 || 12;
    return `${h}:${m} ${suffix}`;
}
function updateCountdown() {
    if (!prayerTimes ||!prayerTimes._dates) return;
    const now = new Date(); const dates = prayerTimes._dates;
    let nextName = "", nextDate = null;
    if (now < dates.Fajr) { nextName = "الصبح"; nextDate = dates.Fajr; }
    else if (now < dates.Dhuhr) { nextName = "الظهر"; nextDate = dates.Dhuhr; }
    else if (now < dates.Maghrib) { nextName = "المغرب"; nextDate = dates.Maghrib; }
    else {
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const tSun = calculateSunTimes(currentLat, currentLng, tomorrow);
        nextName = "الصبح"; nextDate = new Date(tSun.sunrise.getTime() - 60*60*1000);
    }
    const diffMins = Math.floor((nextDate - now) / 60000);
    document.getElementById('nextPrayerCounter').innerText = `باقي على ${nextName}: ${Math.floor(diffMins/60)}س ${diffMins%60}د - فلكي`;
}
function calculateQibla(lat, lng) {
    const PI = Math.PI; const KAABA_LAT = 21.4225 * PI / 180; const KAABA_LNG = 39.8262 * PI / 180;
    const latRad = lat * PI / 180; const lngRad = lng * PI / 180; const dLng = KAABA_LNG - lngRad;
    const y = Math.sin(dLng) * Math.cos(KAABA_LAT);
    const x = Math.cos(latRad)*Math.sin(KAABA_LAT) - Math.sin(latRad)*Math.cos(KAABA_LAT)*Math.cos(dLng);
    let angle = Math.atan2(y,x)*180/PI; angle = (angle+360)%360;
    const R=6371; const dLat=KAABA_LAT-latRad;
    const a=Math.sin(dLat/2)**2 + Math.cos(latRad)*Math.cos(KAABA_LAT)*Math.sin(dLng/2)**2;
    return { angle, distance: R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) };
}
function updateQiblaAngle(lat,lng){
    const r=calculateQibla(lat,lng); qiblaAngleGlobal=r.angle;
    document.getElementById('qiblaValue').innerText=Math.round(r.angle)+'°';
    document.getElementById('distanceValue').innerText=Math.round(r.distance)+' كم';
    document.getElementById('qiblaIndicator').style.transform=`translate(-50%,-50%) rotate(${r.angle}deg) translateY(-110px) rotate(${-r.angle}deg)`;
}
function updateCalibration(v){
    calibrationOffset=parseInt(v); localStorage.setItem('mizan_compass_calibration',calibrationOffset);
    document.getElementById('calibrationValue').innerText=(calibrationOffset>0?'+':'')+calibrationOffset+'°';
    updateCompassUI(currentHeading,true);
}
function updateCompassUI(heading,isCal=false){
    if(!isCal) currentHeading=(heading+calibrationOffset+360)%360;
    document.getElementById('compassNeedle').style.transform=`translate(-50%,-100%) rotate(${-currentHeading}deg)`;
    document.getElementById('headingValue').innerText=Math.round(currentHeading)+'°';
    const diff=Math.abs(((currentHeading-qiblaAngleGlobal+540)%360)-180);
    const dirEl=document.getElementById('qiblaDirection');
    if(diff<8){ dirEl.innerText='أنت باتجاه القبلة ✓'; dirEl.style.color='#2ed573'; }
    else{
        const turn=(qiblaAngleGlobal-currentHeading+360)%360;
        dirEl.innerText= turn<180? `استدر ${Math.round(turn)}° يميناً` : `استدر ${Math.round(360-turn)}° يساراً`;
    }
}
function requestCompassPermission(){
    if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function'){
        DeviceOrientationEvent.requestPermission().then(s=>{ if(s==='granted') startCompass(); });
    }else{ startCompass(); }
}
function startCompass(){ window.addEventListener('deviceorientation', handleOrientation, true); }
function handleOrientation(e){
    let h=null;
    if(e.webkitCompassHeading!==undefined) h=e.webkitCompassHeading;
    else if(e.alpha!==null) h=360-e.alpha;
    if(h!==null) updateCompassUI(h);
}
function togglePrayerMenu(){ const m=document.getElementById('prayerMenu'); m.style.display=m.style.display==='block'?'none':'block'; }
function checkDay(){
    const now=new Date(); const today=now.toLocaleDateString();
    document.getElementById('dateText').innerText=now.toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'numeric',day:'numeric'});
    if(db.lastUpdate!==today){ db.sins.forEach(i=>i.d=false); db.obeys.forEach(i=>i.d=false); db.lastUpdate=today; sync(); }
}
function setTab(t){
    activeTab=t; document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    const list=document.getElementById('list'); const qibla=document.getElementById('qiblaContainer');
    const fab=document.getElementById('fab');
    if(t==='qibla'){ list.style.display='none'; qibla.style.display='block'; fab.style.display='none'; }
    else{ list.style.display='block'; qibla.style.display='none'; fab.style.display=t==='cfg'?'none':'flex'; render(); }
}
function render(){
    const container=document.getElementById('list'); container.innerHTML='';
    if(activeTab==='cfg'){
        container.innerHTML=`<div class="item-card" onclick="exportData()"><b>📥 تصدير</b></div><div class="item-card" onclick="fullReset()" style="color:var(--sin-color)"><b>🧹 مسح شامل</b></div><p style="text-align:center;color:#ccc;font-size:12px;">V9.0 فلكي - بدون انترنت<br>الصبح = قبل الشروق 60د</p>`; return;
    }
    db[activeTab].forEach((item,i)=>{
        const card=document.createElement('div'); card.className=`item-card ${item.d?'done':''}`;
        card.innerHTML=`<div class="item-info"><b>${item.n}</b><span>${item.nt||''}</span></div><div class="btns"><button class="btn btn-note" onclick="openEdit(${i})">📝</button><button class="btn btn-check ${item.d?(activeTab==='sins'?'active-s':'active-o'):''}" onclick="toggle(${i})">${item.d?(activeTab==='sins'?'✕':'✓'):''}</button></div>`;
        container.appendChild(card);
    }); updateP();
}
function toggle(i){ db[activeTab][i].d=!db[activeTab][i].d; sync(); render(); }
function updateP(){
    const s=db.sins.filter(x=>x.d).length; const o=db.obeys.filter(x=>x.d).length;
    let p=50+(o*8)-(s*10); p=Math.max(5,Math.min(100,p));
    const bar=document.getElementById('pBar'); bar.style.width=p+'%';
}
function openAdd(){ editIdx=null; document.getElementById('overlay').style.display='flex'; }
function openEdit(i){ editIdx=i; const item=db[activeTab][i]; document.getElementById('mName').value=item.n; document.getElementById('mNote').value=item.nt; document.getElementById('overlay').style.display='flex'; }
function saveData(){
    const n=document.getElementById('mName').value.trim(); const nt=document.getElementById('mNote').value.trim();
    if(!n) return; if(editIdx!==null){ db[activeTab][editIdx].n=n; db[activeTab][editIdx].nt=nt; } else{ db[activeTab].push({n,d:false,nt}); }
    sync(); closeModal(); render();
}
function deleteCurrent(){ db[activeTab].splice(editIdx,1); sync(); closeModal(); render(); }
function closeModal(){ document.getElementById('overlay').style.display='none'; }
function sync(){ localStorage.setItem('mizan_pro_v5', JSON.stringify(db)); }
function exportData(){ const a=document.createElement('a'); a.href="data:text/json;charset=utf-8,[STRIPPED]+encodeURIComponent(JSON.stringify(db)); a.download="mizan_backup.json"; a.click(); }
function fullReset(){ if(confirm("مسح كل شيء؟")){ localStorage.clear(); location.reload(); } }
window.onload=()=>{ checkDay(); render(); initPrayerService(); };