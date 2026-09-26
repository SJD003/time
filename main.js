
    let db = JSON.parse(localStorage.getItem('mizan_pro_v5')) || {
        sins: [{n:"الغيبة", d:false, nt:""}],
        obeys: [{n:"الصلوات الخمس", d:false, nt:""}],
        lastUpdate: new Date().toLocaleDateString()
    };

    let activeTab = 'sins';
    let editIdx = null;

    // --- Prayer Times & Hijri Logic (Start) ---
    let prayerTimes = null;

    // دالة لإضافة دقائق للوقت بصيغة 24 ساعة
    function addMinutes(timeStr, minsToAdd) {
        let [h, m] = timeStr.split(':').map(Number);
        let date = new Date();
        date.setHours(h, m + minsToAdd, 0, 0);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function initPrayerService() {
        updateHijriDate();
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude),
                (err) => {
                    document.getElementById('nextPrayerCounter').innerText = "تم استخدام الموقع الافتراضي";
                    // إحداثيات افتراضية (قلعة سكر) في حال رفض الموقع
                    fetchPrayerTimes(31.8481, 46.0664); 
                }
            );
        } else {
            fetchPrayerTimes(31.8481, 46.0664);
        }
    }

    function updateHijriDate() {
        const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-civil', {
            day: 'numeric', month: 'long', year: 'numeric'
        }).format(Date.now());
        document.getElementById('hijriDateDisplay').innerText = hijri;
    }

    function fetchPrayerTimes(lat, lng) {
        const date = Math.floor(Date.now() / 1000);
        // Method 0 = Shia Ithna-Ashari
        const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${lat}&longitude=${lng}&method=0`;

        fetch(url)
            .then(res => res.json())
            .then(data => {
                const raw = data.data.timings;
                
                // تطبيق القواعد الخاصة بك:
                // الصبح: +35 دقيقة
                // الظهر: +10 دقائق
                // المغرب: نفس التوقيت الجعفري الرسمي
                prayerTimes = {
                    'Fajr': addMinutes(raw.Fajr, 20),
                    'Dhuhr': addMinutes(raw.Dhuhr, 10),
                    'Maghrib': addMinutes(raw.Maghrib,10),
                };
                
                document.getElementById('t-fajr').innerText = convertTime(prayerTimes.Fajr);
                document.getElementById('t-dhuhr').innerText = convertTime(prayerTimes.Dhuhr);
                document.getElementById('t-maghrib').innerText = convertTime(prayerTimes.Maghrib);
                
                setInterval(updateCountdown, 1000);
                updateCountdown();
            })
            .catch(e => {
                document.getElementById('nextPrayerCounter').innerText = "خطأ في الاتصال";
            });
    }

    function convertTime(time24) {
        let [h, m] = time24.split(':');
        h = parseInt(h);
        const suffix = h >= 12 ? 'م' : 'ص';
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
            nextPrayerName = "الصبح";
            diff = tFajr - currentTime;
        } else if (currentTime < tDhuhr) {
            nextPrayerName = "الظهر";
            diff = tDhuhr - currentTime;
        } else if (currentTime < tMaghrib) {
            nextPrayerName = "المغرب";
            diff = tMaghrib - currentTime;
        } else {
            nextPrayerName = "الصبح";
            diff = (24 * 60 - currentTime) + tFajr;
        }

        const hLeft = Math.floor(diff / 60);
        const mLeft = diff % 60;
        document.getElementById('nextPrayerCounter').innerText = `باقي على ${nextPrayerName}: ${hLeft}س ${mLeft}د`;
    }

    function togglePrayerMenu() {
        const menu = document.getElementById('prayerMenu');
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
    // --- Prayer Times Logic (End) ---

    function checkDay() {
        const now = new Date();
        const today = now.toLocaleDateString();
        const options = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
        document.getElementById('dateText').innerText = now.toLocaleDateString('ar-EG', options);
        
        if(db.lastUpdate !== today) {
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
        document.getElementById('fab').style.display = (t === 'cfg') ? 'none' : 'flex';
        render();
    }

    function render() {
        const container = document.getElementById('list');
        container.innerHTML = '';
        if(activeTab === 'cfg') {
            container.innerHTML = `
                <div class="item-card" onclick="exportData()"><b>📥 تصدير نسخة احتياطية</b></div>
                <div class="item-card" onclick="fullReset()" style="color:var(--sin-color)"><b>🧹 مسح شامل للبيانات</b></div>
                <p style="text-align:center; color:#ccc; font-size:12px;">نسخة التطبيق V5.7 Platinum</p>
            `;
            return;
        }
        db[activeTab].forEach((item, i) => {
            const card = document.createElement('div');
            card.className = `item-card ${item.d ? 'done' : ''}`;
            const btnClass = item.d ? (activeTab === 'sins' ? 'active-s' : 'active-o') : '';
            const mark = item.d ? (activeTab === 'sins' ? '✕' : '✓') : '';
            card.innerHTML = `<div class="item-info"><b>${item.n}</b><span>${item.nt || 'لا توجد ملاحظات'}</span></div>
                <div class="btns"><button class="btn btn-note" onclick="openEdit(${i})">📝</button>
                <button class="btn btn-check ${btnClass}" onclick="toggle(${i})">${mark}</button></div>`;
            container.appendChild(card);
        });
        updateP();
    }

    function toggle(i) {
        db[activeTab][i].d = !db[activeTab][i].d;
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
        bar.style.background = p < 45 ? 'var(--sin-color)' : (p > 55 ? 'var(--obey-color)' : 'var(--primary)');
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
        if(editIdx !== null) { db[activeTab][editIdx].n = n; db[activeTab][editIdx].nt = nt; }
        else { db[activeTab].push({n:n, d:false, nt:nt}); }
        sync(); closeModal(); render();
    }

    function deleteCurrent() {
        if(confirm("حذف هذا العمل؟")){ db[activeTab].splice(editIdx, 1); sync(); closeModal(); render(); }
    }

    function closeModal() { document.getElementById('overlay').style.display = "none"; }
    function sync() { localStorage.setItem('mizan_pro_v5', JSON.stringify(db)); }
    function exportData() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db));
        const a = document.createElement('a'); a.href = dataStr; a.download = "mizan_backup.json"; a.click();
    }
    function fullReset() { if(confirm("سيتم مسح كل شيء؟")){ localStorage.clear(); location.reload(); } }

    window.onload = () => { 
        checkDay(); render(); initPrayerService(); 
    };