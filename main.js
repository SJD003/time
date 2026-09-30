let db = JSON.parse(localStorage.getItem('mizan_pro_v5')) || {
    sins: [{n:"الغيبة", d:false, nt:""}],
    obeys: [{n:"الصلوات الخمس", d:false, nt:""}],
    lastUpdate: new Date().toLocaleDateString()
};

let activeTab = 'sins';
let editIdx = null;

// --- إعدادات الإشعارات الجديدة ---
const PRAYER_AR = { 'Fajr': 'الفجر', 'Dhuhr': 'الظهر', 'Asr': 'العصر', 'Maghrib': 'المغرب', 'Isha': 'العشاء' };
let notifiedCache = JSON.parse(localStorage.getItem('mizan_notified_today') || '{}');

// دالة طلب إذن الإشعارات - لازم تنربط بزر
async function requestPrayerNotifications() {
    if (!('Notification' in window)) {
        alert('متصفحك لا يدعم الإشعارات');
        return;
    }
    if (!window.isSecureContext) {
        alert('الإشعارات تعمل فقط على https - ارفع موقعك على GitHub Pages');
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        localStorage.setItem('mizan_notify_enabled', 'true');
        if(navigator.vibrate) navigator.vibrate([100,50,100]);
        alert('✅ تم تفعيل إشعارات الصلاة! راح يجيك إشعار "حان وقت صلاة..."');
        // إشعار تجريبي
        sendPrayerNotification('Dhuhr');
        render(); // تحديث واجهة الإعدادات
    } else {
        alert('❌ تم رفض الإشعارات من إعدادات المتصفح');
    }
}

// دالة إرسال الإشعار الفعلي
async function sendPrayerNotification(enName) {
    if (Notification.permission!== 'granted') return;
    if (localStorage.getItem('mizan_notify_enabled')!== 'true') return;
    if (localStorage.getItem(`notify-${enName}`) === 'false') return;

    const arName = PRAYER_AR[enName] || enName;
    const reg = await navigator.serviceWorker.ready;

    reg.showNotification(`حان وقت صلاة ${arName}`, {
        body: `حان الآن موعد أذان ${arName} - ${document.getElementById('hijriDateDisplay')?.innerText || ''}`,
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        tag: `prayer-${enName}-${new Date().toDateString()}`, // يمنع التكرار بنفس اليوم
        data: { prayer: enName },
        silent: false
    });
}

// فحص هل حان وقت صلاة؟
function checkPrayerNotification(currentMinutes) {
    if (!prayerTimes) return;
    if (Notification.permission!== 'granted') return;

    const today = new Date().toDateString();
    // تصفير السجل عند يوم جديد
    if (localStorage.getItem('mizan_notify_date')!== today) {
        notifiedCache = {};
        localStorage.setItem('mizan_notify_date', today);
        localStorage.setItem('mizan_notified_today', JSON.stringify({}));
    }

    for (const [enName, timeStr] of Object.entries(prayerTimes)) {
        const [h, m] = timeStr.split(':').map(Number);
        const prayerMins = h * 60 + m;

        // إذا الوقت الحالي يطابق وقت الصلاة تماماً ولم نرسل إشعار اليوم
        if (currentMinutes === prayerMins) {
            const key = `${today}_${enName}`;
            if (!notifiedCache[key]) {
                sendPrayerNotification(enName);
                notifiedCache[key] = true;
                localStorage.setItem('mizan_notified_today', JSON.stringify(notifiedCache));
            }
        }
    }
}

// --- Prayer Times & Hijri Logic ---
let prayerTimes = null;
const DEFAULT_COORDS = { lat: 31.8481, lng: 46.0664 }; // قلعة سكر

function addMinutes(timeStr, minsToAdd) {
    let [h, m] = timeStr.split(':').map(Number);
    let date = new Date();
    date.setHours(h, m + minsToAdd, 0, 0);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function initPrayerService() {
    updateHijriDate();
    const cached = JSON.parse(localStorage.getItem('mizan_last_loc') || 'null');
    if (cached) {
        fetchPrayerTimes(cached.lat, cached.lng, true);
        document.getElementById('locStatus').innerText = `موقع محفوظ: ${cached.lat.toFixed(2)}, ${cached.lng.toFixed(2)}`;
    } else {
        fetchPrayerTimes(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng, false);
    }
    updateNotifyUI();
}

function updateNotifyUI(){
    const el = document.getElementById('notifyStatus');
    if(!el) return;
    if(Notification.permission === 'granted' && localStorage.getItem('mizan_notify_enabled') === 'true'){
        el.innerText = '✅ الإشعارات مفعلة';
        el.style.color = 'var(--obey-color)';
    } else {
        el.innerText = '🔕 غير مفعلة - اضغط تفعيل';
        el.style.color = '#999';
    }
}

function requestLocation() {
    const counterEl = document.getElementById('nextPrayerCounter');
    const statusEl = document.getElementById('locStatus');
    if (!window.isSecureContext) {
        alert("تنبيه: خدمات الموقع لا تعمل إلا على رابط آمن https");
        return;
    }
    if (!navigator.geolocation) {
        statusEl.innerText = "متصفحك لا يدعم تحديد الموقع";
        return;
    }
    counterEl.innerText = "جاري تحديد موقعك...";
    statusEl.innerText = "يرجى الموافقة على طلب الموقع";
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            localStorage.setItem('mizan_last_loc', JSON.stringify({ lat: latitude, lng: longitude }));
            statusEl.innerText = "تم تحديد الموقع بنجاح ✓";
            fetchPrayerTimes(latitude, longitude, true);
            if(navigator.vibrate) navigator.vibrate(50);
        },
        (err) => {
            let msg = "";
            if (err.code === 1) msg = "تم رفض الإذن. فعل GPS من إعدادات المتصفح";
            else if (err.code === 2) msg = "تعذر تحديد الموقع، تأكد من تفعيل GPS";
            else if (err.code === 3) msg = "انتهى وقت الطلب";
            statusEl.innerText = msg;
            counterEl.innerText = "فشل تحديد الموقع";
            if (err.code === 3) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude, longitude } = pos.coords;
                        fetchPrayerTimes(latitude, longitude, true);
                    },
                    () => fetchPrayerTimes(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng, false),
                    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
                );
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function updateHijriDate() {
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-civil', { day: 'numeric', month: 'long', year: 'numeric' }).format(Date.now());
    const el = document.getElementById('hijriDateDisplay');
    if(el) el.innerText = hijri;
}

function fetchPrayerTimes(lat, lng, isPrecise = false) {
    const date = Math.floor(Date.now() / 1000);
    const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${lat}&longitude=${lng}&method=0`;
    fetch(url).then(res => res.json()).then(data => {
        const raw = data.data.timings;
        prayerTimes = {
            'Fajr': addMinutes(raw.Fajr, 20),
            'Dhuhr': addMinutes(raw.Dhuhr, 10),
            'Asr': addMinutes(raw.Asr, 10),
            'Maghrib': addMinutes(raw.Maghrib, 10),
            'Isha': addMinutes(raw.Isha, 5),
        };
        document.getElementById('t-fajr') && (document.getElementById('t-fajr').innerText = convertTime(prayerTimes.Fajr));
        document.getElementById('t-dhuhr') && (document.getElementById('t-dhuhr').innerText = convertTime(prayerTimes.Dhuhr));
        document.getElementById('t-asr') && (document.getElementById('t-asr').innerText = convertTime(prayerTimes.Asr));
        document.getElementById('t-maghrib') && (document.getElementById('t-maghrib').innerText = convertTime(prayerTimes.Maghrib));
        document.getElementById('t-isha') && (document.getElementById('t-isha').innerText = convertTime(prayerTimes.Isha));

        if(!isPrecise &&!localStorage.getItem('mizan_last_loc')){
            document.getElementById('nextPrayerCounter').innerText = "الموقع الافتراضي (اضغط للتحديث)";
        }
        if (window.prayerInterval) clearInterval(window.prayerInterval);
        window.prayerInterval = setInterval(updateCountdown, 1000);
        updateCountdown();
    }).catch(e => {
        document.getElementById('nextPrayerCounter').innerText = "خطأ في الاتصال";
    });
}

function convertTime(time24) {
    let [h, m] = time24.split(':');
    h = parseInt(h);
    const suffix = h >= 12? 'م' : 'ص';
    h = h % 12 || 12;
    return `${h}:${m} ${suffix}`;
}

function updateCountdown() {
    if(!prayerTimes) return;
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const getMinutes = (t) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);

    const tFajr = getMinutes(prayerTimes.Fajr);
    const tDhuhr = getMinutes(prayerTimes.Dhuhr);
    const tMaghrib = getMinutes(prayerTimes.Maghrib);

    let nextPrayerName = "";
    let diff = 0;

    if (currentTime < tFajr) {
        nextPrayerName = "الصبح"; diff = tFajr - currentTime;
    } else if (currentTime < tDhuhr) {
        nextPrayerName = "الظهر"; diff = tDhuhr - currentTime;
    } else if (currentTime < tMaghrib) {
        nextPrayerName = "المغرب"; diff = tMaghrib - currentTime;
    } else {
        nextPrayerName = "الصبح"; diff = (24 * 60 - currentTime) + tFajr;
    }
    const hLeft = Math.floor(diff / 60);
    const mLeft = diff % 60;
    document.getElementById('nextPrayerCounter').innerText = `باقي على ${nextPrayerName}: ${hLeft}س ${mLeft}د`;

    // --- هذا السطر الجديد هو اللي يفحص الإشعار ---
    checkPrayerNotification(currentTime);
}

// باقي دوالك تبقى نفسها...
function togglePrayerMenu() {
    const menu = document.getElementById('prayerMenu');
    menu.style.display = menu.style.display === 'block'? 'none' : 'block';
}
function checkDay() {
    const now = new Date();
    const today = now.toLocaleDateString();
    const options = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
    document.getElementById('dateText').innerText = now.toLocaleDateString('ar-EG', options);
    if(db.lastUpdate!== today) {
        db.sins.forEach(i => i.d = false);
        db.obeys.forEach(i => i.d = false);
        db.lastUpdate = today;
        sync();
    }
}
function setTab(t) {
    activeTab = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    document.getElementById('fab').style.display = (t === 'cfg')? 'none' : 'flex';
    render();
}
function render() {
    const container = document.getElementById('list');
    container.innerHTML = '';
    if(activeTab === 'cfg') {
        container.innerHTML = `
            <div class="item-card" style="flex-direction:column; align-items:flex-start; gap:10px">
                <b>🔔 إشعارات الصلاة</b>
                <div style="display:flex; gap:10px; align-items:center">
                    <button class="btn" style="background:var(--primary); color:#fff; padding:8px 15px; border-radius:8px; border:none" onclick="requestPrayerNotifications()">تفعيل الإشعارات</button>
                    <span id="notifyStatus"></span>
                </div>
                <small style="color:#888">سيصلك إشعار "حان وقت صلاة..." عند كل أذان</small>
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:5px">
                    ${Object.entries(PRAYER_AR).map(([en, ar])=>`
                        <label style="display:flex; justify-content:space-between; width:100%"><span>${ar}</span>
                        <input type="checkbox" ${localStorage.getItem(`notify-${en}`)!=='false'? 'checked' : ''} onchange="localStorage.setItem('notify-${en}', this.checked)">
                        </label>
                    `).join('')}
                </div>
                <button onclick="sendPrayerNotification('Dhuhr')" style="margin-top:10px">▶ تجربة إشعار الظهر الآن</button>
            </div>
            <div class="item-card" onclick="exportData()"><b>📥 تصدير نسخة احتياطية</b></div>
            <div class="item-card" onclick="fullReset()" style="color:var(--sin-color)"><b>🧹 مسح شامل للبيانات</b></div>
            <p style="text-align:center; color:#ccc; font-size:12px;">نسخة التطبيق V5.8 مع الإشعارات</p>
        `;
        setTimeout(updateNotifyUI, 100);
        return;
    }
    db[activeTab].forEach((item, i) => {
        const card = document.createElement('div');
        card.className = `item-card ${item.d? 'done' : ''}`;
        const btnClass = item.d? (activeTab === 'sins'? 'active-s' : 'active-o') : '';
        const mark = item.d? (activeTab === 'sins'? '✕' : '✓') : '';
        card.innerHTML = `<div class="item-info"><b>${item.n}</b><span>${item.nt || 'لا توجد ملاحظات'}</span></div>
            <div class="btns"><button class="btn btn-note" onclick="openEdit(${i})">📝</button>
            <button class="btn btn-check ${btnClass}" onclick="toggle(${i})">${mark}</button></div>`;
        container.appendChild(card);
    });
    updateP();
}
function toggle(i) {
    db[activeTab][i].d =!db[activeTab][i].d;
    if(window.navigator.vibrate) window.navigator.vibrate(15);
    sync(); render();
}
function updateP() {
    const s = db.sins.filter(x => x.d).length;
    const o = db.obeys.filter(x => x.d).length;
    let p = 50 + (o * 8) - (s * 10);
    p = Math.max(5, Math.min(100, p));
    const bar = document.getElementById('pBar');
    bar.style.width = p + '%';
    bar.style.background = p < 45? 'var(--sin-color)' : (p > 55? 'var(--obey-color)' : 'var(--primary)');
}
function openAdd() {
    editIdx = null;
    document.getElementById('mTitle').innerText = "إضافة عمل جديد";
    document.getElementById('mName').value = ""; document.getElementById('mNote').value = "";
    document.getElementById('deleteBtn').style.display = "none";
    document.getElementById('overlay').style.display = "flex";
}
function openEdit(i) {
    editIdx = i;
    const item = db[activeTab][i];
    document.getElementById('mTitle').innerText = "تعديل البيانات";
    document.getElementById('mName').value = item.n; document.getElementById('mNote').value = item.nt;
    document.getElementById('deleteBtn').style.display = "block";
    document.getElementById('overlay').style.display = "flex";
}
function saveData() {
    const n = document.getElementById('mName').value;
    const nt = document.getElementById('mNote').value;
    if(!n) return;
    if(editIdx!== null) { db[activeTab][editIdx].n = n; db[activeTab][editIdx].nt = nt; }
    else { db[activeTab].push({n:n, d:false, nt:nt}); }
    sync(); closeModal(); render();
}
function deleteCurrent() {
    if(confirm("حذف هذا العمل؟")){ db[activeTab].splice(editIdx, 1); sync(); closeModal(); render(); }
}
function closeModal() { document.getElementById('overlay').style.display = "none"; }
function sync() { localStorage.setItem('mizan_pro_v5', JSON.stringify(db)); }
function exportData() {
    const dataStr = "data:text/json;charset=utf-8,[STRIPPED] + encodeURIComponent(JSON.stringify(db));
    const a = document.createElement('a'); a.href = dataStr; a.download = "mizan_backup.json"; a.click();
}
function fullReset() { if(confirm("سيتم مسح كل شيء؟")){ localStorage.clear(); location.reload(); } }

window.onload = () => {
    checkDay(); render(); initPrayerService();
};