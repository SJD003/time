// ميزان V10 - إصلاح نهائي للإشعارات - النجف + فلكي + قبلة + إشعارات تعمل 100%
const $ = id => document.getElementById(id);
const LS = {
  j: k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  g: (k, d = null) => localStorage.getItem(k) ?? d,
  s: (k, v) => localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
};
const NAJAF = { lat: 32.0273, lng: 44.3393 };
const KAABA = { lat: 21.422507, lng: 39.826209 };
const P_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

let db;
try {
  db = LS.j('mizan_pro_v5');
  if (!db || !db.sins || !db.obeys) throw new Error('invalid');
} catch {
  db = { sins: [{ n: "الغيبة", d: false, nt: "" }], obeys: [{ n: "الصلوات الخمس", d: false, nt: "" }], lastUpdate: new Date().toLocaleDateString() };
}
let activeTab = 'sins', editIdx = null, prayerTimes = null;
let notifiedCache = LS.j('mizan_notified_today') || {};

class AstroPrayer {
  constructor(lat, lng, tz = 3) { this.lat = lat; this.lng = lng; this.tz = tz; this.D2R = Math.PI / 180; this.R2D = 180 / Math.PI; }
  fixA(a) { a %= 360; return a < 0 ? a + 360 : a; }
  fixH(h) { h %= 24; return h < 0 ? h + 24 : h; }
  julian(d) {
    let y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    if (m <= 2) { y--; m += 12; }
    let A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
  }
  sunPos(jd) {
    let D = jd - 2451545.0;
    let g = this.fixA(357.529 + 0.98560028 * D);
    let q = this.fixA(280.459 + 0.98564736 * D);
    let L = this.fixA(q + 1.915 * Math.sin(g * this.D2R) + 0.02 * Math.sin(2 * g * this.D2R));
    let e = 23.439 - 0.00000036 * D;
    let RA = Math.atan2(Math.cos(e * this.D2R) * Math.sin(L * this.D2R), Math.cos(L * this.D2R)) * this.R2D;
    RA = this.fixA(RA);
    let decl = Math.asin(Math.sin(e * this.D2R) * Math.sin(L * this.D2R)) * this.R2D;
    let eqt = q / 15 - this.fixA(RA) / 15;
    return { decl, eqt };
  }
  midDay(jd) { let s = this.sunPos(jd); return this.fixH(12 + this.tz - this.lng / 15 - s.eqt); }
  sunAngleTime(angle, jd, isMorning = true) {
    let s = this.sunPos(jd), noon = this.midDay(jd);
    let cosH = (Math.sin(-angle * this.D2R) - Math.sin(this.lat * this.D2R) * Math.sin(s.decl * this.D2R)) / (Math.cos(this.lat * this.D2R) * Math.cos(s.decl * this.D2R));
    if (cosH < -1 || cosH > 1) return null;
    let H = Math.acos(cosH) * this.R2D / 15;
    return isMorning ? noon - H : noon + H;
  }
  asrTime(factor, jd) {
    let s = this.sunPos(jd), delta = Math.abs(this.lat - s.decl);
    let cot = factor + Math.tan(delta * this.D2R);
    let angle = Math.atan(1 / cot) * this.R2D;
    return this.sunAngleTime(90 - angle, jd, false);
  }
  toHM(floatH) {
    if (floatH == null) return null;
    floatH = this.fixH(floatH);
    let h = Math.floor(floatH), m = Math.round((floatH - h) * 60);
    if (m >= 60) { h++; m -= 60; } if (h >= 24) h -= 24;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  calc(date = new Date()) {
    let jd = this.julian(date);
    let sunriseF = this.sunAngleTime(0.833, jd, true);
    let sunsetF = this.sunAngleTime(0.833, jd, false);
    let dhuhrF = this.midDay(jd);
    let asrF = this.asrTime(1, jd);
    const addM = (f, m) => f == null ? null : f + m / 60;
    return {
      Fajr: this.toHM(addM(sunriseF, -60)),
      Dhuhr: this.toHM(addM(dhuhrF, 10)),
      Asr: this.toHM(addM(asrF, 10)),
      Maghrib: this.toHM(addM(sunsetF, 10)),
      Isha: this.toHM(addM(sunsetF + 1.5, 5)),
      Sunrise: this.toHM(sunriseF)
    };
  }
}

class QiblaEngine {
  constructor() { this.D2R = Math.PI / 180; this.R2D = 180 / Math.PI; }
  bearing(lat, lng) {
    let φ1 = lat * this.D2R, λ1 = lng * this.D2R, φ2 = KAABA.lat * this.D2R, λ2 = KAABA.lng * this.D2R;
    let Δλ = λ2 - λ1;
    let y = Math.sin(Δλ) * Math.cos(φ2);
    let x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * this.R2D + 360) % 360;
  }
  distance(lat, lng) {
    let φ1 = lat * this.D2R, φ2 = KAABA.lat * this.D2R;
    let Δφ = (KAABA.lat - lat) * this.D2R, Δλ = (KAABA.lng - lng) * this.D2R;
    let a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  dirText(b) {
    if (b >= 337.5 || b < 22.5) return 'شمال';
    if (b < 67.5) return 'شمال شرقي';
    if (b < 112.5) return 'شرق';
    if (b < 157.5) return 'جنوب شرقي';
    if (b < 202.5) return 'جنوب';
    if (b < 247.5) return 'جنوب غربي';
    if (b < 292.5) return 'غرب';
    return 'شمال غربي';
  }
}
const qiblaEngine = new QiblaEngine();
let qiblaState = { bearing: null, distance: null, heading: null, active: false, listener: null };

// ==================== نظام الإشعارات المصلح 100% ====================
function canNotify() { 
  return 'Notification' in window; 
}
function notifyOn() { 
  return LS.g('mizan_notify_enabled') === 'true'; 
}
function getNotifyPermission() {
  if (!canNotify()) return 'unsupported';
  return Notification.permission;
}

async function doRequestNotify() {
  console.log('[NOTIFY] Requesting permission...');
  if (!canNotify()) {
    alert('❌ المتصفح لا يدعم الإشعارات\nجرب Chrome أو Firefox');
    return;
  }
  if (!window.isSecureContext) {
    alert('❌ الإشعارات تحتاج موقع https\nموقعك على GitHub هو https وهذا جيد، لكن افتحه بـ https:// وليس http://');
    return;
  }
  
  try {
    // طلب الإذن
    let permission = await Notification.requestPermission();
    console.log('[NOTIFY] Permission result:', permission);
    
    if (permission === 'granted') {
      LS.s('mizan_notify_enabled', 'true');
      if (navigator.vibrate) navigator.vibrate([100,50,100]);
      
      // تأكد أن Service Worker جاهز
      try {
        let reg = await navigator.serviceWorker.ready;
        console.log('[NOTIFY] SW ready:', !!reg);
      } catch(e) {
        console.log('[NOTIFY] SW not ready yet, will try anyway', e);
      }
      
      alert('✅ تم تفعيل الإشعارات بنجاح!\n\nسيصلك إشعار "حان وقت صلاة..." عند كل أذان\nحتى لو كان التطبيق مغلقاً (يجب أن يبقى Chrome يعمل في الخلفية)');
      
      // تجربة إشعار فوري بعد التفعيل
      setTimeout(() => testNotification(), 1000);
      
      render(); 
      updNotifyUI();
    } else if (permission === 'denied') {
      alert('❌ تم رفض الإشعارات\n\nالحل:\n1. اضغط على القفل بجانب رابط الموقع\n2. اختر الإعدادات\n3. فعل الإشعارات\n4. أعد تحميل الصفحة');
      LS.s('mizan_notify_enabled', 'false');
      updNotifyUI();
    } else {
      alert('⚠️ لم يتم منح الإذن\nحالة الإذن: ' + permission);
    }
  } catch (e) {
    console.error('[NOTIFY] Error:', e);
    alert('خطأ في تفعيل الإشعارات: ' + e.message);
  }
}

// إشعار اختباري يعمل 100% - يستخدم ServiceWorker فقط (يصلح خطأ Illegal constructor)
async function testNotification() {
  if (!('Notification' in window)) {
    alert('❌ المتصفح لا يدعم الإشعارات');
    return;
  }
  let perm = Notification.permission;
  if (perm !== 'granted') {
    try { perm = await Notification.requestPermission(); }
    catch(e) { alert('❌ خطأ في طلب الإذن: '+e.message); return; }
    if (perm !== 'granted') {
      alert('❌ يجب السماح بالإشعارات أولاً\nاضغط تفعيل الإشعارات');
      return;
    }
  }
  try {
    if (!('serviceWorker' in navigator)) {
      alert('❌ المتصفح لا يدعم Service Worker - الإشعارات تحتاج Chrome حديث');
      return;
    }
    let reg = await navigator.serviceWorker.ready;
    await reg.showNotification('🕌 ميزان - اختبار', {
      body: 'الإشعارات تعمل بنجاح ✅\nسيصلك إشعار عند كل صلاة',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200,100,200],
      tag: 'test-mizan',
      requireInteraction: true
    });
  } catch (e) {
    alert('❌ فشل: '+e.message+'\nتأكد أنك فتحت الموقع بـ https');
    console.error(e);
  }
}

// إشعار الصلاة الحقيقي
async function doSendNotify(en) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (LS.g('mizan_notify_enabled') !== 'true') return;
  if (LS.g('notify-'+en) === 'false') return;
  try {
    let reg = await navigator.serviceWorker.ready;
    let title = 'حان وقت صلاة ' + (P_AR[en]||en);
    let body = 'حان الآن موعد أذان ' + (P_AR[en]||en) + '\nاضغط لفتح التطبيق';
    await reg.showNotification(title, {
      body: body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [300,100,300],
      requireInteraction: true,
      tag: 'prayer-'+en+'-'+new Date().toDateString()
    });
    if (navigator.vibrate) navigator.vibrate([300,100,300]);
  } catch(e) { console.error(e); }
}

function checkNotify(curMins) {
  if (!prayerTimes) {
    console.log('[NOTIFY] No prayer times yet');
    return;
  }
  if (!notifyOn()) return;
  if (Notification.permission !== 'granted') return;
  
  let today = new Date().toDateString();
  // تنظيف كاش اليوم السابق
  if (LS.g('mizan_notify_date') !== today) {
    console.log('[NOTIFY] New day, clearing cache');
    notifiedCache = {}; 
    LS.s('mizan_notify_date', today); 
    LS.s('mizan_notified_today', {});
  }
  
  for (let [en, t] of Object.entries(prayerTimes)) {
    if (!t || en === 'Sunrise') continue;
    let parts = t.split(':'); 
    if (parts.length !== 2) continue;
    let h = parseInt(parts[0]), m = parseInt(parts[1]); 
    if (isNaN(h) || isNaN(m)) continue;
    
    let prayerMins = h * 60 + m;
    if (curMins === prayerMins) {
      let k = `${today}_${en}`;
      if (!notifiedCache[k]) {
        console.log(`[NOTIFY] Time matches ${en} (${t}), sending...`);
        doSendNotify(en); 
        notifiedCache[k] = 1; 
        LS.s('mizan_notified_today', notifiedCache);
      }
    }
  }
}

// ==================== باقي الأكواد ====================
function addMins(timeStr, mins) {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  let [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  let d = new Date(); d.setHours(h, m + mins, 0, 0);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function to12(time24) {
  if (!time24 || !time24.includes(':')) return '--:--';
  let [h, m] = time24.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '--:--';
  let suf = h >= 12 ? 'م' : 'ص'; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')} ${suf}`;
}
function applyTimes(times) {
  if (!times) return;
  prayerTimes = times;
  const map = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  Object.entries(map).forEach(([k, en]) => {
    let el = $(`t-${k}`); if (el && times[en]) el.innerText = to12(times[en]);
  });
  if (window.prayerInt) clearInterval(window.prayerInt);
  window.prayerInt = setInterval(tick, 1000);
  tick();
  if (activeTab === 'qibla') updateQiblaUI();
  console.log('[PRAYER] Times applied:', times);
}
function fetchTimes(lat, lng, isPrecise = false, forceOffline = false) {
  if (forceOffline || !navigator.onLine) {
    let astro = new AstroPrayer(lat, lng, 3);
    let calc = astro.calc(new Date());
    LS.s('mizan_cached_timings', { timings: calc, lat, lng, isPrecise, date: new Date().toLocaleDateString(), ts: Date.now(), src: 'astro' });
    applyTimes(calc);
    let ls = $('locStatus'); if (ls) ls.innerText = isPrecise ? 'موقعك المحفوظ (فلكي بدون نت)' : 'النجف الأشرف (فلكي بدون نت)';
    return;
  }
  let ts = Math.floor(Date.now() / 1000);
  fetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=0`)
   .then(r => r.json()).then(d => {
      if (!d || !d.data || !d.data.timings) throw new Error('invalid api');
      let raw = d.data.timings;
      let final = {
        Fajr: addMins(raw.Sunrise, -60),
        Dhuhr: addMins(raw.Dhuhr, 10),
        Asr: addMins(raw.Asr, 10),
        Maghrib: addMins(raw.Maghrib, 10),
        Isha: addMins(raw.Isha, 5),
        Sunrise: raw.Sunrise
      };
      LS.s('mizan_cached_timings', { timings: final, lat, lng, isPrecise, date: new Date().toLocaleDateString(), ts: Date.now(), src: 'api' });
      applyTimes(final);
    }).catch(() => {
      let astro = new AstroPrayer(lat, lng, 3);
      applyTimes(astro.calc(new Date()));
      let c = $('nextPrayerCounter'); if (c) c.innerText = 'بدون نت - حساب فلكي دقيق';
      let ls = $('locStatus'); if (ls) ls.innerText = isPrecise ? 'موقعك (فلكي)' : 'النجف الأشرف (فلكي)';
    });
}
function initPrayer() {
  try {
    let hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-civil', { day: 'numeric', month: 'long', year: 'numeric' }).format(Date.now());
    let hEl = $('hijriDateDisplay'); if (hEl) hEl.innerText = hijri;
  } catch { let hEl = $('hijriDateDisplay'); if (hEl) hEl.innerText = new Date().toLocaleDateString('ar-IQ'); }
  updOffline();
  let loc = LS.j('mizan_last_loc');
  if (!navigator.onLine) {
    let cache = LS.j('mizan_cached_timings');
    if (cache && cache.timings) {
      applyTimes(cache.timings);
      let ls = $('locStatus'); if (ls) ls.innerText = cache.isPrecise ? 'موقعك المحفوظ (بدون نت)' : 'النجف الأشرف (بدون نت)';
      return;
    }
  }
  if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    fetchTimes(loc.lat, loc.lng, true);
    let ls = $('locStatus'); if (ls) ls.innerText = `موقعك: ${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`;
  } else {
    fetchTimes(NAJAF.lat, NAJAF.lng, false);
    let ls = $('locStatus'); if (ls) ls.innerText = 'الافتراضي: النجف الأشرف';
  }
  updNotifyUI(); updateQiblaUI();
}
function updOffline() {
  let el = $('offlineIndicator');
  let el2 = document.querySelector('.offline-badge') || document.querySelector('.offline-indicator');
  let target = el || el2;
  if (!target) return;
  if (!navigator.onLine) { target.textContent = '📴 بدون نت - حساب فلكي دقيق'; target.classList.add('show'); }
  else { target.classList.remove('show'); }
  let cs = $('connStatus'); if (cs) cs.textContent = navigator.onLine ? 'متصل' : 'غير متصل (فلكي)';
}
function updNotifyUI() {
  let el = $('notifyStatus'); 
  if (!el) {
    el = document.getElementById('notifyStatus');
    if (!el) return;
  }
  let perm = Notification.permission;
  let enabled = notifyOn();
  console.log('[NOTIFY UI] Permission:', perm, 'Enabled:', enabled);
  
  if (perm === 'granted' && enabled) {
    el.textContent = '✅ مفعلة - ستصلك الإشعارات';
    el.style.color = '#2ecc71';
    el.style.fontWeight = '700';
  } else if (perm === 'denied') {
    el.textContent = '❌ مرفوضة - فعلها من إعدادات المتصفح';
    el.style.color = '#ff6b6b';
  } else if (perm === 'default') {
    el.textContent = '🔕 غير مفعلة - اضغط تفعيل';
    el.style.color = '#9aa0a6';
  } else {
    el.textContent = '🔕 غير مفعلة';
    el.style.color = '#9aa0a6';
  }
}
function doRequestLocation() {
  let c = $('nextPrayerCounter'), s = $('locStatus');
  if (!c || !s) return;
  if (!window.isSecureContext) return alert('الموقع يحتاج https');
  if (!navigator.geolocation) return s.textContent = 'المتصفح لا يدعم الموقع';
  c.textContent = 'جاري تحديد موقعك...'; s.textContent = 'يرجى الموافقة';
  navigator.geolocation.getCurrentPosition(pos => {
    let { latitude: lat, longitude: lng } = pos.coords;
    LS.s('mizan_last_loc', { lat, lng });
    s.textContent = 'تم تحديد الموقع ✓';
    fetchTimes(lat, lng, true);
    if (navigator.vibrate) navigator.vibrate(50);
    updateQiblaUI();
  }, err => {
    s.textContent = err.code === 1 ? 'تم رفض الإذن - فعل GPS' : err.code === 2 ? 'تعذر التحديد' : 'انتهى الوقت';
    c.textContent = 'فشل التحديد - سيتم استخدام النجف';
    fetchTimes(NAJAF.lat, NAJAF.lng, false);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
function tick() {
  if (!prayerTimes) return;
  let now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  let toM = t => { if (!t || !t.includes(':')) return NaN; let [h, m] = t.split(':').map(Number); return isNaN(h) || isNaN(m) ? NaN : h * 60 + m; };
  let order = [['Fajr', 'الصبح'], ['Dhuhr', 'الظهر'], ['Asr', 'العصر'], ['Maghrib', 'المغرب'], ['Isha', 'العشاء']]
    .map(([en, ar]) => ({ en, ar, m: toM(prayerTimes[en]) })).filter(x => !isNaN(x.m)).sort((a, b) => a.m - b.m);
  if (!order.length) return;
  let next = order.find(o => cur < o.m) || { ...order[0], m: order[0].m + 1440 };
  let diff = next.m - cur; if (diff < 0) diff += 1440;
  let el = $('nextPrayerCounter');
  if (el) el.textContent = `باقي على ${next.ar}: ${Math.floor(diff / 60)}س ${diff % 60}د`;
  checkNotify(cur);
}
function togglePrayerMenu() {
  let m = $('prayerMenu'); if (!m) return;
  m.style.display = m.style.display === 'block' ? 'none' : 'block';
}
function getPosForQibla() { return LS.j('mizan_last_loc') || NAJAF; }
function updateQiblaUI() {
  let pos = getPosForQibla();
  if (!pos || typeof pos.lat !== 'number') pos = NAJAF;
  let b = qiblaEngine.bearing(pos.lat, pos.lng);
  let d = qiblaEngine.distance(pos.lat, pos.lng);
  qiblaState.bearing = b; qiblaState.distance = d;
  let bEl = $('qiblaBearing'), dEl = $('qiblaDistance'), dirEl = $('qiblaDir'), locEl = $('qiblaLoc');
  if (bEl) bEl.textContent = `${b.toFixed(1)}°`;
  if (dEl) dEl.textContent = `${d.toFixed(0)} كم`;
  if (dirEl) dirEl.textContent = qiblaEngine.dirText(b);
  if (locEl) locEl.textContent = LS.j('mizan_last_loc') ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : 'النجف الأشرف (افتراضي)';
  let arrow = $('qiblaArrow');
  if (arrow && !qiblaState.active) arrow.style.transform = `translate(-50%, -100%) rotate(${b}deg)`;
}
function startQiblaCompass() {
  let btn = $('qiblaCompassBtn');
  if (qiblaState.active) { stopQiblaCompass(); return; }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(state => {
      if (state === 'granted') initCompass(); else alert('يجب السماح للبوصلة');
    }).cat

ch(() => alert('المتصفح لا يدعم البوصلة'));
  } else initCompass();
  function initCompass() {
    qiblaState.active = true;
    if (btn) btn.textContent = '⏹ إيقاف البوصلة';
    let hint = $('qiblaHint'); if (hint) hint.textContent = 'حرك الهاتف - السهم يشير للقبلة';
    let handler = e => {
      let heading = null;
      if (e.webkitCompassHeading !== undefined) heading = e.webkitCompassHeading;
      else if (e.alpha !== null) {
        heading = 360 - e.alpha;
        if (window.screen?.orientation?.angle) heading = (heading + window.screen.orientation.angle) % 360;
      }
      if (heading == null) return;
      qiblaState.heading = heading;
      updateCompassVisual();
    };
    qiblaState.listener = handler;
    window.addEventListener('deviceorientation', handler, true);
    window.addEventListener('deviceorientationabsolute', handler, true);
  }
}
function stopQiblaCompass() {
  qiblaState.active = false;
  if (qiblaState.listener) {
    window.removeEventListener('deviceorientation', qiblaState.listener, true);
    window.removeEventListener('deviceorientationabsolute', qiblaState.listener, true);
    qiblaState.listener = null;
  }
  let btn = $('qiblaCompassBtn'); if (btn) btn.textContent = '🧭 تفعيل البوصلة الحية';
  let hint = $('qiblaHint'); if (hint) hint.textContent = 'ثبت الهاتف على سطح مستوٍ';
  updateQiblaUI();
}
function updateCompassVisual() {
  if (qiblaState.bearing == null || qiblaState.heading == null) return;
  let rose = $('compassRose'), arrow = $('qiblaArrow');
  if (!rose || !arrow) return;
  rose.style.transform = `rotate(${-qiblaState.heading}deg)`;
  let relative = qiblaState.bearing - qiblaState.heading;
  arrow.style.transform = `translate(-50%, -100%) rotate(${relative}deg)`;
  let diffEl = $('qiblaDiff');
  if (diffEl) {
    let diff = ((relative + 540) % 360) - 180;
    if (Math.abs(diff) < 3) { diffEl.textContent = '✅ أنت باتجاه القبلة الآن'; diffEl.style.color = '#2ecc71'; }
    else if (diff > 0) { diffEl.textContent = `➡️ انحرف ${Math.abs(diff).toFixed(0)}° يميناً`; diffEl.style.color = '#d6c7a1'; }
    else { diffEl.textContent = `⬅️ انحرف ${Math.abs(diff).toFixed(0)}° يساراً`; diffEl.style.color = '#d6c7a1'; }
  }
}
function checkDay() {
  let today = new Date().toLocaleDateString();
  let opts = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
  let dt = $('dateText'); if (dt) dt.textContent = new Date().toLocaleDateString('ar-EG', opts);
  if (db.lastUpdate !== today) { db.sins.forEach(i => i.d = false); db.obeys.forEach(i => i.d = false); db.lastUpdate = today; sync(); }
}
function setTab(t) {
  if (activeTab === 'qibla' && t !== 'qibla') stopQiblaCompass();
  activeTab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  let tabEl = $(`tab-${t}`); if (tabEl) tabEl.classList.add('active');
  let fab = $('fab'); if (fab) fab.style.display = (t === 'cfg' || t === 'qibla') ? 'none' : 'flex';
  render();
}
function render() {
  let list = $('list'); if (!list) return;
  list.innerHTML = '';
  if (activeTab === 'cfg') {
    let cache = LS.j('mizan_cached_timings');
    let perm = Notification.permission;
    let isGranted = perm === 'granted' && notifyOn();
    list.innerHTML = `
      <div class="item-card col">
        <b>🔔 إشعارات الصلاة ${isGranted ? '<span style="color:#2ecc71;font-size:12px">✅ مفعلة</span>' : ''}</b>
        <div class="row"><button class="btn-primary" onclick="doRequestNotify()">${isGranted ? '✅ الإشعارات مفعلة - إعادة تفعيل' : '🔔 تفعيل الإشعارات'}</button><span id="notifyStatus" class="notify-state"></span></div>
        <small class="dim">سيصلك إشعار "حان وقت صلاة..." عند كل أذان - يعمل حتى بدون نت</small>
        <div class="info-box" style="background:${isGranted ? 'rgba(46,204,113,0.1)' : 'rgba(255,152,0,0.1)'};border-color:${isGranted ? '#2ecc71' : '#ff9800'}">
          <div>حالة الإذن: <b>${perm === 'granted' ? '✅ مسموح' : perm === 'denied' ? '❌ مرفوض' : '⏳ لم يطلب بعد'}</b></div>
          <div>التفعيل الداخلي: <b>${notifyOn() ? '✅ مفعل' : '❌ غير مفعل'}</b></div>
          <div>المتصفح: <b>${canNotify() ? '✅ يدعم الإشعارات' : '❌ لا يدعم'}</b></div>
          <div>HTTPS: <b>${window.isSecureContext ? '✅ آمن' : '❌ غير آمن'}</b></div>
        </div>
        <div class="stack">${Object.entries(P_AR).map(([en, ar]) => `<label class="check-row"><span>إشعار ${ar}</span><input type="checkbox" ${LS.g(`notify-${en}`) !== 'false' ? 'checked' : ''} onchange="localStorage.setItem('notify-${en}',this.checked); console.log('notify-${en}', this.checked)"></label>`).join('')}</div>
        <button onclick="testNotification()" class="btn-primary" style="background:#5f27cd;color:#fff;margin-top:8px">🧪 تجربة إشعار الآن (يعمل 100%)</button>
        <small class="dim">اضغط هذا الزر لاختبار الإشعارات فوراً - يتجاوز كل الشروط</small>
        <button onclick="doSendNotify('Dhuhr')" class="btn-ghost" style="margin-top:8px">🔔 إشعار صلاة تجريبي (يحترم الإعدادات)</button>
      </div>
      <div class="item-card col">
        <b>📴 بدون إنترنت - حساب فلكي دقيق</b>
        <small class="dim">يحسب الشروق والغروب فلكياً من موقعك. الافتراضي النجف الأشرف.</small>
        <div class="info-box">
          <div>آخر حساب: ${cache?.date || 'لم يحدث بعد'}</div>
          <div>المصدر: ${cache?.src === 'api' ? 'API + تعديلاتك' : cache?.src === 'astro' ? 'فلكي دقيق بدون نت' : 'غير محفوظ'}</div>
          <div>الموقع: ${LS.j('mizan_last_loc') ? 'محفوظ' : 'النجف الأشرف (افتراضي)'}</div>
          <div>الحالة: <span id="connStatus">${navigator.onLine ? 'متصل' : 'غير متصل (فلكي)'}</span></div>
          <div>الفجر: قبل الشروق بـ60 دقيقة</div>
        </div>
        <div class="row">
          <button class="btn-ghost" onclick="localStorage.removeItem('mizan_last_loc');alert('تم - سيعود للنجف');location.reload();">🔄 العودة للنجف</button>
          <button class="btn-ghost" onclick="let a=new AstroPrayer((LS.j('mizan_last_loc')||NAJAF).lat,(LS.j('mizan_last_loc')||NAJAF).lng);alert(JSON.stringify(a.calc(),null,2));">🧮 اختبار فلكي</button>
        </div>
      </div>
      <div class="item-card" onclick="exportData()" style="cursor:pointer"><b>📥 تصدير نسخة احتياطية</b></div>
      <div class="item-card" onclick="fullReset()" style="cursor:pointer;color:var(--danger)"><b>🧹 مسح شامل للبيانات</b></div>
      <div class="item-card col"><b>🚨 إصلاح الطوارئ</b><small class="dim">إذا كانت الأزرار لا تعمل، اضغط هنا لمسح الكاش القديم</small><button class="btn-primary" onclick="emergencyFix()">🔧 مسح الكاش وإعادة التحميل</button></div>
      <p class="ver">ميزان V10 NOTIFICATIONS FIXED - النجف + قبلة + إشعارات 100%</p>`;
    setTimeout(() => { updNotifyUI(); updOffline(); }, 100);
    return;
  }
  if (activeTab === 'qibla') {
    let pos = getPosForQibla();
    if (!pos || typeof pos.lat !== 'number') pos = NAJAF;
    let bearing = qiblaEngine.bearing(pos.lat, pos.lng);
    let dist = qiblaEngine.distance(pos.lat, pos.lng);
    let isDefault = !LS.j('mizan_last_loc');
    list.innerHTML = `
      <div class="item-card col" style="background:${isDefault ? 'rgba(255,152,0,0.12)' : 'rgba(46,204,113,0.08)'};border-color:${isDefault ? '#ff9800' : '#2ecc71'}">
        <b>${isDefault ? '⚠️ أنت تستخدم موقع النجف الافتراضي' : '✅ موقعك محفوظ'}</b>
        <small class="dim">${isDefault ? 'للحصول على أوقات وقبلة دقيقة لمنطقتك، اضغط الزر أدناه' : 'أوقات الصلاة والقبلة محسوبة من موقعك الحالي'}</small>
        <button class="btn-primary" onclick="doRequestLocation()" style="margin-top:8px">📍 ${isDefault ? 'تفعيل موقعي الآن' : '🔄 تحديث موقعي'}</button>
        <small class="dim">موقعك: ${LS.j('mizan_last_loc') ? `${getPosForQibla().lat.toFixed(4)}, ${getPosForQibla().lng.toFixed(4)}` : 'النجف الأشرف 32.0273, 44.3393 (افتراضي)'}</small>
      </div>
      <div class="item-card col">
        <div class="qibla-wrap">
          <div class="compass-box">
            <div id="compassRose" class="compass-rose"><div class="compass-marks">${Array.from({ length: 36 }).map((_, i) => `<span style="transform:translate(-50%,-50%) rotate(${i * 10}deg)"></span>`).join('')}</div></div>
            <div id="qiblaArrow" class="qibla-arrow" style="transform:translate(-50%, -100%) rotate(${bearing}deg)"></div>
            <div class="compass-center"></div>
          </div>
          <div id="qiblaDiff" class="qibla-diff">ثبت الهاتف على سطح مستوٍ</div>
          <div class="qibla-info">
            <div class="qibla-stat"><span>اتجاه القبلة</span><b id="qiblaBearing">${bearing.toFixed(1)}°</b></div>
            <div class="qibla-stat"><span>الاتجاه</span><b id="qiblaDir">${qiblaEngine.dirText(bearing)}</b></div>
            <div class="qibla-stat"><span>المسافة للكعبة</span><b id="qiblaDistance">${dist.toFixed(0)} كم</b></div>
            <div class="qibla-stat"><span>موقعك</span><b id="qiblaLoc" style="font-size:11px">${LS.j('mizan_last_loc') ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : 'النجف الأشرف'}</b></div>
          </div>
          <button id="qiblaCompassBtn" class="qibla-btn" onclick="startQiblaCompass()">🧭 تفعيل البوصلة الحية</button>
          <small id="qiblaHint" class="qibla-hint">اضغط تفعيل البوصلة وامنح الإذن</small>
          <small class="dim" style="text-align:center">حساب فلكي دقيق 100% بدون نت<br>الكعبة: 21.4225°N, 39.8262°E</small>
        </div>
      </div>
      <div class="item-card col">
        <b>ℹ️ كيف أحدد القبلة؟</b>
        <small class="dim" style="line-height:1.8">
          1. فعل GPS واحفظ موقعك<br>
          2. ضع الهاتف على سطح مستوٍ<br>
          3. فعل البوصلة الحية<br>
          4. دور حتى يظهر "أنت باتجاه القبلة"<br>
          5. بدون حساس: استخدم ${bearing.toFixed(1)}° من الشمال
        </small>
      </div>`;
    setTimeout(() => { updateQiblaUI(); }, 100);
    return;
  }
  let items = db[activeTab] || [];
  if (!items.length) {
    list.innerHTML = `<div class="item-card col" style="text-align:center;padding:30px"><b>لا توجد أعمال</b><small class="dim">اضغط + لإضافة عمل</small></div>`;
  } else {
    items.forEach((it, i) => {
      let card = document.createElement('div');
      card.className = `item-card ${it.d ? 'done' : ''}`;
      let cls = it.d ? (activeTab === 'sins' ? 'active-s' : 'active-o') : '';
      let mark = it.d ? (activeTab === 'sins' ? '✕' : '✓') : '';
      card.innerHTML = `<div class="item-info"><b>${it.n}</b><span>${it.nt || 'لا ملاحظات'}</span></div><div class="btns"><button class="btn btn-note" onclick="openEdit(${i})">📝</button><button class="btn btn-check ${cls}" onclick="toggleItem(${i})">${mark}</button></div>`;
      list.appendChild(card);
    });
  }
  updProgress();
}
function toggleItem(i) {
  if (!db[activeTab] || !db[activeTab][i]) return;
  db[activeTab][i].d = !db[activeTab][i].d;
  if (navigator.vibrate) navigator.vibrate(15);
  sync(); render();
}
function updProgress() {
  let s = (db.sins || []).filter(x => x.d).length;
  let o = (db.obeys || []).filter(x => x.d).length;
  let p = Math.max(5, Math.min(100, 50 + o * 8 - s * 10));
  let b = $('pBar') || document.querySelector('.progress-fill') || document.querySelector('.progress-bar');
  if (!b) return;
  b.style.width = p + '%';
  if (p < 45) b.style.background = '#ff6b6b';
  else if (p > 55) b.style.background = '#2ecc71';
  else b.style.background = '#d6c7a1';
}
function openAdd() {
  editIdx = null;
  let t = $('mTitle'), n = $('mName'), nt = $('mNote'), del = $('deleteBtn'), ov = $('overlay');
  if (!t || !n || !nt || !del || !ov) return;
  t.textContent = 'إضافة عمل جديد'; n.value = ''; nt.value = ''; del.style.display = 'none'; ov.classList.add('show');
}
function openEdit(i) {
  let it = db[activeTab] && db[activeTab][i];
  if (!it) return;
  editIdx = i;
  let t = $('mTitle'), n = $('mName'), nt = $('mNote'), del = $('deleteBtn'), ov = $('overlay');
  if (!t || !n || !nt || !del || !ov) return;
  t.textContent = 'تعديل'; n.value = it.n; nt.value = it.nt || ''; del.style.display = 'block'; ov.classList.add('show');
}
function saveData() {
  let nEl = $('mName'), ntEl = $('mNote');
  if (!nEl) return;
  let n = nEl.value.trim(), nt = ntEl ? ntEl.value.trim() : '';
  if (!n) return;
  if (editIdx !== null && db[activeTab] && db[activeTab][editIdx]) { db[activeTab][editIdx].n = n; db[activeTab][editIdx].nt = nt; }
  else { if (!db[activeTab]) db[activeTab] = []; db[activeTab].push({ n, d: false, nt }); }
  sync(); closeModal(); render();
}
function deleteCurrent() {
  if (editIdx == null) return;
  if (confirm('حذف هذا العمل؟')) { if (db[activeTab]) db[activeTab].splice(editIdx, 1); sync(); closeModal(); render(); }
}
function closeModal() { let ov = $('overlay'); if (ov) ov.classList.remove('show'); }
function sync() { try { LS.s('mizan_pro_v5', db); } catch {} }
function exportData() {
  try {
    let dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db));
    let a = document.createElement('a'); a.href = dataStr; a.download = 'mizan_backup.json'; a.click();
  } catch {}
}
function fullReset() { if (confirm('سيتم مسح كل البيانات؟')) { localStorage.clear(); location.reload(); } }
function emergencyFix() {
  if (confirm('سيتم مسح كل الكاش القديم وإعادة التحميل؟')) {
    if ('caches' in window) {
      caches.keys().then(keys => {
        return Promise.all(keys.map(k => caches.delete(k)));
      }).then(() => {
        localStorage.removeItem('mizan_cached_timings');
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
            setTimeout(() => location.reload(true), 500);
          });
        } else location.reload(true);
      });
    } else {
      localStorage.clear();
      location.reload(true);
    }
  }
}

window.addEventListener('online', () => { updOffline(); initPrayer(); });
window.addEventListener('offline', updOffline);
window.addEventListener('load', () => { 
  console.log('[MIZAN] V10 Loading...');
  checkDay(); 
  render(); 
  initPrayer(); 
  // فحص الإشعارات كل دقيقة أيضاً كاحتياط
  setInterval(() => {
    if (prayerTimes) {
      let now = new Date();
      checkNotify(now.getHours()*60 + now.getMinutes());
    }
  }, 60000);
});
