// ============================================================
// AUDIO — tiny base64 beeps
// ============================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const playBeep = (freq = 880, duration = 0.15) => {
  try {
    const ctx = new AudioCtx(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration);
  } catch(e) {}
};
const playBlockEnd = () => { playBeep(1047, 0.2); setTimeout(() => playBeep(1319, 0.3), 250); };
const playRestEnd = () => { playBeep(784, 0.15); setTimeout(() => playBeep(1047, 0.2), 200); };

// ============================================================
// STATE MANAGEMENT
// ============================================================
const LS_KEY = 'studyos';
const TIMER_SNAP_KEY = 'studyos_timer_snap';
const FORBIDDEN_WORDS = ['学习','复习','掌握','理解','弄懂','过一遍','看看','了解','熟悉','知道'];
const PRESET_SUBJECTS = ['math','biochem','english','politics'];
const PRESET_SUBJECT_NAMES = { math:'数学', biochem:'生化', english:'英语', politics:'政治' };
const PRESET_SUBJECT_COLORS = { math:'#5B9E8A', biochem:'#4A8C9E', english:'#5E9E4E', politics:'#8B7EB8' };
const CUSTOM_SUBJECT_COLORS = ['#D4956B','#C47EA0','#7EA0C4','#B8A06E','#8E9EB0','#D08A80','#7EAD94','#9B8EC4'];

let SUBJECTS = [...PRESET_SUBJECTS];
let SUBJECT_NAMES = { ...PRESET_SUBJECT_NAMES };
let SUBJECT_COLORS = { ...PRESET_SUBJECT_COLORS };

function rebuildSubjectLookups(state) {
  const customs = state.customSubjects || [];
  const removed = state.removedPresetSubjects || [];
  const activePresets = PRESET_SUBJECTS.filter(s => !removed.includes(s));
  SUBJECTS = [...activePresets, ...customs.map(c => c.key)];
  SUBJECT_NAMES = { ...PRESET_SUBJECT_NAMES };
  SUBJECT_COLORS = { ...PRESET_SUBJECT_COLORS };
  customs.forEach(c => {
    SUBJECT_NAMES[c.key] = c.name;
    SUBJECT_COLORS[c.key] = c.color;
  });
}
const SIGNALS = ['平静','焦虑','无聊','疲惫','兴奋'];
const SIGNAL_CSS = { '平静':'active-calm','焦虑':'active-anxious','无聊':'active-bored','疲惫':'active-tired','兴奋':'active-excited' };
const MODES = {
  '平静': { name:'正常模式', cards:3, desc:'正常执行。3张任务卡。' },
  '焦虑': { name:'低威胁模式', cards:2, desc:'降低威胁。2张任务卡，倾向输入型。' },
  '无聊': { name:'挑战模式', cards:4, desc:'用挑战激活。4张任务卡，用高难度刺激专注。' },
  '疲惫': { name:'最小模式', cards:1, desc:'最小可行日。1张任务卡。你今天只需要存在。' },
  '兴奋': { name:'冲刺模式', cards:5, desc:'能量充沛。5张任务卡。用这股劲冲高难度。' },
};

const NAV_ITEMS = [
  { key: 'newCard',  label: '新卡',   icon: '＋', action: 'App.showCreateCard()' },
  { key: 'pool',     label: '任务池', icon: '📋', action: "App.openDrawer('pool')", badge: 'poolBadge' },
  { key: 'summary',  label: '总结',   icon: '📊', action: "App.openDrawer('summary')" },
  { key: 'parking',  label: '停车场', icon: '🅿️', action: 'App.showParkingLot()' },
  { key: 'exposure', label: '接触区', icon: '🎯', action: 'App.showExposure()' },
  { key: 'backup',   label: '后备卡', icon: '🃏', action: 'App.showBackupCards()' },
];

const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr = () => { const d = new Date(); d.setHours(d.getHours() - 4); return fmtLocal(d); };
const tomorrowStr = () => { const d = new Date(); d.setHours(d.getHours() - 4); d.setDate(d.getDate() + 1); return fmtLocal(d); };
const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

function defaultState() {
  return {
    version: 1, startDate: todayStr(), days: {}, cards: {},
    backupCards: [
      { text: '做下一道题', subject: 'math' }, { text: '翻译下一段阅读', subject: 'english' },
      { text: '精讲第4章画思维导图', subject: 'politics' }, { text: '闭卷默写刚才的代谢步骤', subject: 'biochem' },
    ],
    parkingLot: [], navbarItems: ['newCard', 'pool', 'summary'],
    customSubjects: [], removedPresetSubjects: [], primarySubjects: ['math', 'biochem', 'english', 'politics'],
    settings: { blockDuration: 50, restDuration: 10 }
  };
}

const loadState = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const s = JSON.parse(raw); if (s.version >= 1) return s; }
  } catch(e) {}
  return defaultState();
};

const saveState = s => localStorage.setItem(LS_KEY, JSON.stringify(s));

const saveTimerSnap = timer => localStorage.setItem(TIMER_SNAP_KEY, JSON.stringify({
  mode: timer.mode, startTime: timer.startTime, elapsedBeforePause: timer.elapsedBeforePause,
  totalDuration: timer.totalDuration, restDuration: timer.restDuration,
  activeCardId: timer.activeCardId, backupCardId: timer.backupCardId, savedAt: Date.now(),
}));

const loadTimerSnap = () => {
  try { return JSON.parse(localStorage.getItem(TIMER_SNAP_KEY)); }
  catch (e) { return null; }
};

const clearTimerSnap = () => localStorage.removeItem(TIMER_SNAP_KEY);

// ============================================================
// APP NAMESPACE
// ============================================================
const App = {
  state: null,
  timer: {
    mode: 'IDLE', // IDLE | RUNNING | PAUSED | RESTING
    startTime: null,
    elapsedBeforePause: 0,
    totalDuration: 50 * 60,
    restDuration: 10 * 60,
    intervalId: null,
    activeCardId: null,
    backupCardId: null,
  },
  currentDrawer: null,
  currentFloat: null,
  cardPickerSlot: -1,
  poolFilter: 'all',
  summaryTab: 'daily',
  _fromLanding: false,
  _wakeLock: null,
  _notificationsOk: false,
  _timerWorker: null,
  _nightOverride: null,
  _currentDay: null,

  _isMobile() { const w = window.innerWidth, h = window.innerHeight; return Math.min(w, h) <= 768; },

  checkDayChange() {
    const today = todayStr();
    if (this._currentDay && today !== this._currentDay) {
      saveState(this.state);
      clearTimerSnap();
      location.reload();
    }
    this._currentDay = today;
  },

  init() {
    this.state = loadState();
    rebuildSubjectLookups(this.state);
    this.ensureToday();
        this.restoreTimer();
    this.initTimerWorker();
    this.renderBottomBar();

    // PWA manifest (blob URL)
    try {
      const manifest = {
        name: '学习OS', short_name: '学习OS', start_url: '.',
        display: 'standalone', background_color: '#F2F6F2', theme_color: '#F2F6F2',
        description: 'ADHD 考研学习操作系统',
        icons: [{ src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="#F2F6F2"/><text x="96" y="110" text-anchor="middle" font-size="72" fill="#6B9A80">🧠</text></svg>'), sizes: '192x192', type: 'image/svg+xml' }]
      };
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
      const link = document.createElement('link');
      link.rel = 'manifest'; link.href = URL.createObjectURL(blob);
      document.head.appendChild(link);
    } catch (e) {}

    // Service worker (inline — no external files needed)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      try {
        const swCode = `const CACHE='studyos-v2';const TO_CACHE=[self.location.pathname.split('/').pop()||'index.html'];self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(TO_CACHE)));self.skipWaiting()});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))})`;
        const swBlob = new Blob([swCode], { type: 'application/javascript' });
        navigator.serviceWorker.register(URL.createObjectURL(swBlob)).catch(() => {});
      } catch (e) {}
    }

    // Re-acquire wake lock + check day change when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkDayChange();
        if (this.timer.mode === 'RUNNING') {
          this.requestWakeLock();
          this.hideMiniWindow();
        }
      } else if (document.visibilityState === 'hidden' && (this.timer.mode === 'RUNNING' || this.timer.mode === 'RESTING')) {
        this.showMiniWindow();
      }
    });

    this.initMiniWindow();

    // Check night mode on startup
    this.checkNightMode();

    // Check if today's signal is already set
    const d = todayStr();
    const hasSignal = !!this.state.days[d]?.signal;

    this._currentDay = d;
    if (!hasSignal) {
      document.getElementById('app').style.display = 'none';
      this.initInactivityDetector();
      this.initImmersiveButtons();
      document.addEventListener('keydown', (e) => this.onKey(e));
      setInterval(() => { this.checkNightMode(); this.checkDayChange(); }, 60000);
      this.initLandingPage();
    } else {
      // Apply theme based on existing signal
      if (this._nightOverride !== true) {
        this.applyTheme(this.state.days[d].signal);
      }
      this.renderAll();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById('app').classList.add('reveal-sections');
        });
      });
      this.startTimerTick();
      this.checkSignalReminder();
      setInterval(() => { this.checkSignalReminder(); this.checkNightMode(); this.checkDayChange(); }, 60000);
      document.addEventListener('keydown', (e) => this.onKey(e));
      this.initInactivityDetector();
      this.initImmersiveButtons();
    }
  },

  ensureToday() {
    const d = todayStr();
    if (!this.state.days[d]) {
      this.state.days[d] = { signal: null, targetBlocks: 0, actualBlocks: 0, blocks: [], chainStatus: 'zero' };
      saveState(this.state);
    }
  },

  getTodayCards() { return this.getTodayCardsRaw().slice(0, this.getTodaySlotCount()); },
  getTodaySlotCount() { return 3; },
  getTodayTarget() { return this.getTodayMode()?.cards ?? 3; },
  getPrimarySubjects() { return this.state.primarySubjects || ['math', 'biochem', 'english', 'politics']; },
  isPrimarySubject(subject) { return this.getPrimarySubjects().includes(subject); },
  getPrimaryTodayCards() { return this.getTodayCardsRaw().filter(c => this.isPrimarySubject(c.subject)); },

  getPoolCards(filter = 'all') {
    const cards = [];
    for (const [id, card] of Object.entries(this.state.cards)) {
      if (card.zone === 'pool') {
        if (filter === 'all' || card.subject === filter) cards.push({ id, ...card });
      }
    }
    cards.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return cards;
  },

  getTodayDay() { return this.state.days[todayStr()] || { signal: null, targetBlocks: 3, actualBlocks: 0, blocks: [], chainStatus: 'zero' }; },
  getTodayMode() { return MODES[this.state.days[todayStr()]?.signal] ?? null; },

  getTodayCardsRaw() {
    return Object.entries(this.state.cards)
      .filter(([id, c]) => c.zone === 'today' && !c.completedAt)
      .map(([id, c]) => ({ id, ...c }));
  },

  setSignal(signal) {
    const d = todayStr();
    if (this.state.days[d]?.signal) {
      this.toast('今日信号已锁定——当前为：' + this.state.days[d].signal + '（如需重置请用更多→重置数据）');
      const hint = document.getElementById('signalHint');
      hint.textContent = '今日已锁定：' + this.state.days[d].signal;
      hint.className = 'signal-hint show';
      return;
    }
    const mode = MODES[signal];
    const newCards = mode.cards;
    this.closeAll();
    const panel = document.createElement('div');
    panel.className = 'float-panel show';
    panel.id = 'floatSignalConfirm';
    panel.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:32px;line-height:1;margin-bottom:8px;">${signal === '平静' ? '🧘' : signal === '焦虑' ? '😰' : signal === '无聊' ? '🥱' : signal === '疲惫' ? '😴' : '🔥'}</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:4px;">${mode.name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">${mode.desc}</div>
        <p style="font-size:14px;color:var(--text);margin-bottom:12px;">选择「${signal}」后今日任务区可容纳 <b>${newCards}</b> 张卡，确定吗？</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-ghost" onclick="App.closeAll()" style="min-width:80px;">否</button>
          <button class="btn btn-primary" id="confirmSignalBtn" style="min-width:80px;">是</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    this.currentFloat = 'signalConfirm';
    const ov = document.getElementById('overlay'); ov.style.opacity = ''; ov.style.transition = ''; ov.classList.add('show');
    document.getElementById('confirmSignalBtn').onclick = () => this.confirmSignal(signal);
  },

  confirmSignal(signal) {
    const d = todayStr();
    if (!this.state.days[d]) this.ensureToday();
    const mode = MODES[signal];
    const newCards = mode.cards;
    this.state.days[d].signal = signal;
    this.state.days[d].targetBlocks = newCards;
    const todayCards = this.getTodayCardsRaw();
    const excess = todayCards.slice(newCards);
    if (excess.length > 0) {
      excess.forEach(c => {
        this.state.cards[c.id].zone = 'pool';
      });
      this.toast(`已按${mode.name}调整：${excess.length}张卡移回任务池`);
    }
    saveState(this.state);

    // Apply Morandi theme based on signal
    if (this._nightOverride !== true) {
      this.applyTheme(signal);
    }

    if (this._fromLanding) {
      this._fromLanding = false;
      this.closeLandingConfirm();
      this.transitionToMain();
      // renderAll will be called after transition
      setTimeout(() => {
        this.renderAll();
        this.startTimerTick();
        this.checkSignalReminder();
        setInterval(() => this.checkSignalReminder(), 60000);
      }, 800);
      this.toast(`今日模式：${mode.name}（${newCards} 张卡）`);
    } else {
      this.closeAll();
      this.renderAll();
      this.toast(`今日模式：${mode.name}（${newCards} 张卡）`);
    }
  },

  // ============================================================
  // TIMER
  // ============================================================
  restoreTimer() {
    const snap = loadTimerSnap();
    if (!snap) return;
    const now = Date.now();
    // Abandon if snap older than 2 hours (stale)
    if (now - snap.savedAt > 2 * 60 * 60 * 1000) { clearTimerSnap(); return; }

    if (snap.mode === 'RUNNING') {
      const elapsed = snap.elapsedBeforePause + (now - snap.startTime) / 1000;
      const remaining = snap.totalDuration - elapsed;
      if (remaining <= 0) { clearTimerSnap(); return; }
      this.timer.mode = 'RUNNING';
      this.timer.startTime = snap.startTime;
      this.timer.elapsedBeforePause = snap.elapsedBeforePause;
      this.timer.totalDuration = snap.totalDuration;
      this.timer.activeCardId = snap.activeCardId;
      this.timer.backupCardId = snap.backupCardId;
      document.getElementById('timerArea').classList.add('running');
      document.getElementById('btnTimerMain').textContent = '进行中';
      document.getElementById('btnTimerMain').style.display = '';
      document.getElementById('btnTimerPause').style.display = '';
      document.getElementById('btnTimerAbandon').style.display = '';
      document.getElementById('btnSkipRest').style.display = 'none';
      if (snap.activeCardId) {
        const card = this.state.cards[snap.activeCardId];
        if (card) {
          document.getElementById('timerCardRef').textContent = card.text;
          document.getElementById('timerCardRef').classList.remove('empty');
          document.getElementById('timerCardRef').style.borderLeftColor = SUBJECT_COLORS[card.subject] || 'var(--timer-accent)';
        }
      }
      this.requestWakeLock();
      this.startWorkerTick();
      this.tick();
      this.initInactivityDetector();
    } else if (snap.mode === 'PAUSED') {
      const pauseElapsed = (now - snap.savedAt) / 1000;
      if (pauseElapsed > 3 * 60) { clearTimerSnap(); return; } // abandoned after 3min pause
      this.timer.mode = 'PAUSED';
      this.timer.startTime = snap.startTime;
      this.timer.elapsedBeforePause = snap.elapsedBeforePause;
      this.timer.totalDuration = snap.totalDuration;
      this.timer.activeCardId = snap.activeCardId;
      this.timer.backupCardId = snap.backupCardId;
      document.getElementById('btnTimerMain').textContent = '继续';
      document.getElementById('btnTimerPause').style.display = 'none';
      document.getElementById('btnTimerAbandon').style.display = '';
      document.getElementById('btnSkipRest').style.display = 'none';
      if (snap.activeCardId) {
        const card = this.state.cards[snap.activeCardId];
        if (card) {
          document.getElementById('timerCardRef').textContent = card.text + '（已暂停）';
          document.getElementById('timerCardRef').classList.remove('empty');
          document.getElementById('timerCardRef').style.borderLeftColor = SUBJECT_COLORS[card.subject] || 'var(--timer-accent)';
        }
      }
      // Restart the 3-min countdown from now
      if (this.timer._pauseTimeout) clearTimeout(this.timer._pauseTimeout);
      this.timer._pauseTimeout = setTimeout(() => {
        if (this.timer.mode === 'PAUSED') {
          this.toast('已暂停3分钟，自动继续');
          this.timerResume();
        }
      }, 3 * 60 * 1000);
      this.tick();
    } else if (snap.mode === 'RESTING') {
      const restElapsed = snap.elapsedBeforePause + (now - snap.startTime) / 1000;
      if (restElapsed >= snap.restDuration) {
        clearTimerSnap();
        this.restComplete();
        return;
      }
      this.timer.mode = 'RESTING';
      this.timer.startTime = snap.startTime;
      this.timer.elapsedBeforePause = snap.elapsedBeforePause;
      this.timer.restDuration = snap.restDuration;
      this.timer.activeCardId = snap.activeCardId;
      this.timer.backupCardId = snap.backupCardId;
      document.getElementById('timerArea').classList.add('resting');
      document.getElementById('btnTimerMain').style.display = 'none';
      document.getElementById('btnTimerPause').style.display = 'none';
      document.getElementById('btnTimerAbandon').style.display = 'none';
      document.getElementById('btnSkipRest').style.display = '';
      document.getElementById('timerDisplay').classList.add('rest-num');
      this.tick();
    }
  },

  timerMainAction() {
    const mode = this.timer.mode;
    if (mode === 'IDLE') this.timerStart();
    else if (mode === 'PAUSED') this.timerResume();
    else if (mode === 'RESTING') this.timerStart(); // after rest, start new block
  },

  timerStart() {
    // Use pre-selected card if available, otherwise pick first today card
    let activeCard = null;
    if (this.timer.activeCardId) {
      activeCard = this.state.cards[this.timer.activeCardId];
    }
    if (!activeCard || activeCard.completedAt) {
      const todayCards = this.getTodayCards();
      if (todayCards.length === 0) {
        this.toast('请先单击一张卡片，或确保今日区至少有一张卡片'); return;
      }
      activeCard = todayCards[0];
      this.timer.activeCardId = activeCard.id;
    }
    this.timer.mode = 'RUNNING';
    this.timer.backupCardId = null;
    this.timer.totalDuration = (this.state.settings.blockDuration || 50) * 60;
    this.timer.startTime = Date.now();
    this.timer.elapsedBeforePause = 0;
    document.getElementById('timerArea').classList.add('running');
    document.getElementById('timerArea').classList.remove('resting');
    document.getElementById('btnTimerMain').textContent = '进行中';
    document.getElementById('btnTimerMain').style.display = '';
    document.getElementById('btnTimerPause').style.display = '';
    document.getElementById('btnTimerAbandon').style.display = '';
    document.getElementById('btnSkipRest').style.display = 'none';
    document.getElementById('timerCardRef').textContent = activeCard.text;
    document.getElementById('timerCardRef').classList.remove('empty');
    document.getElementById('timerCardRef').style.borderLeftColor = SUBJECT_COLORS[activeCard.subject] || 'var(--timer-accent)';
    document.getElementById('timerDisplay').classList.remove('rest-num');
    this.renderTodayCards();
    this.requestWakeLock();
    this.requestNotificationPermission();
    this.startWorkerTick();
    this.tick();
    this.initInactivityDetector();
    saveTimerSnap(this.timer);
  },

  timerResume() {
    this.timer.mode = 'RUNNING';
    this.timer.startTime = Date.now();
    document.getElementById('btnTimerMain').textContent = '进行中';
    document.getElementById('btnTimerPause').style.display = '';
    this.requestWakeLock();
    this.startWorkerTick();
    this.tick();
    this.initInactivityDetector();
    if (this.timer._pauseTimeout) { clearTimeout(this.timer._pauseTimeout); this.timer._pauseTimeout = null; }
    saveTimerSnap(this.timer);
  },

  timerPause() {
    if (this.timer.mode !== 'RUNNING') return;
    this.exitImmersive();
    this.releaseWakeLock();
    this.stopWorkerTick();
    this.timer.elapsedBeforePause += (Date.now() - this.timer.startTime) / 1000;
    this.timer.mode = 'PAUSED';
    if (this.timer.intervalId) clearTimeout(this.timer.intervalId);
    document.getElementById('btnTimerMain').textContent = '继续';
    document.getElementById('btnTimerPause').style.display = 'none';
    saveTimerSnap(this.timer);
    // Max pause: 3 minutes then auto-resume
    if (this.timer._pauseTimeout) clearTimeout(this.timer._pauseTimeout);
    this.timer._pauseTimeout = setTimeout(() => {
      if (this.timer.mode === 'PAUSED') {
        this.toast('已暂停3分钟，自动继续');
        this.timerResume();
      }
    }, 3 * 60 * 1000);
  },

  timerAbandon() {
    this.exitImmersive();
    this.releaseWakeLock();
    this.stopWorkerTick();
    this.showAbandonDialog();
  },

  showAbandonDialog() {
    const dialog = document.getElementById('confirmDialog');
    document.getElementById('confirmDialogTitle').textContent = '放弃计时';
    document.getElementById('confirmDialogMsg').innerHTML =
      '<span style="color:#B8443A;">此块不会被计入今天块数。</span><br><br>' +
      '<input type="text" id="abandonReasonInput" placeholder="原因（可留空）..." style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;" autocomplete="off">';
    document.getElementById('confirmDialogYes').onclick = () => {
      const reason = document.getElementById('abandonReasonInput').value.trim();
      this.doAbandon(reason);
      this.closeConfirmDialog();
    };
    document.getElementById('confirmDialogNo').onclick = () => {
      this.closeConfirmDialog();
      // Restart timer if was running
      if (this.timer.mode === 'RUNNING') {
        this.timer.mode = 'RUNNING';
        this.timer.startTime = Date.now();
        this.startWorkerTick();
        this.tick();
        this.initInactivityDetector();
      }
    };
    dialog.classList.add('show');
    setTimeout(() => {
      const inp = document.getElementById('abandonReasonInput');
      if (inp) inp.focus();
    }, 200);
  },

  _resetTimerIdleUI() {
    this.hideMiniWindow();
    if (this.timer.intervalId) { clearTimeout(this.timer.intervalId); this.timer.intervalId = null; }
    const el = id => document.getElementById(id);
    el('timerArea').classList.remove('running', 'resting');
    el('btnTimerMain').textContent = '开始'; el('btnTimerMain').style.display = '';
    el('btnTimerPause').style.display = 'none'; el('btnTimerAbandon').style.display = 'none';
    el('btnSkipRest').style.display = 'none'; el('blockGrade').style.display = 'none';
    el('timerDisplay').textContent = '50:00'; el('timerDisplay').classList.remove('rest-num');
    el('timerProgress').style.strokeDashoffset = '0';
    el('timerCardRef').textContent = '选择今日卡片后开始'; el('timerCardRef').classList.add('empty');
    el('timerCardRef').style.borderLeftColor = 'var(--border)';
  },

  doAbandon(reason) {
    if (reason) {
      if (!this.state.abandonLog) this.state.abandonLog = [];
      this.state.abandonLog.push({
        time: new Date().toISOString(), cardId: this.timer.activeCardId,
        elapsed: Math.round((Date.now() - this.timer.startTime) / 1000 / 60), reason,
      });
    }
    this.timer.mode = 'IDLE';
    this.timer.activeCardId = null;
    this.timer.backupCardId = null;
    this.timer.elapsedBeforePause = 0;
    this._resetTimerIdleUI();
    saveState(this.state);
    this.renderTodayCards();
    this.tick();
    this.toast(reason ? '已记录放弃原因' : '块已放弃');
    clearTimerSnap();
  },

  blockComplete() {
    playBlockEnd();
    this.exitImmersive();
    this.releaseWakeLock();
    this.stopWorkerTick();
    const d = todayStr();
    const day = this.state.days[d];
    const block = {
      id: 'b' + uid(),
      cardId: this.timer.activeCardId,
      backupCardId: this.timer.backupCardId || null,
      subject: this.state.cards[this.timer.activeCardId]?.subject || 'math',
      type: this.state.cards[this.timer.activeCardId]?.type || 'output',
      startTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      duration: this.state.settings.blockDuration || 50,
      grade: null,
    };
    day.blocks.push(block);
    day.actualBlocks = day.blocks.length;

    // Update chain status
    if (day.actualBlocks >= day.targetBlocks && day.targetBlocks > 0) day.chainStatus = 'full';
    else if (day.actualBlocks > 0) day.chainStatus = 'half';
    else day.chainStatus = 'zero';

    // Mark card as completed if this is an output block
    const card = this.state.cards[this.timer.activeCardId];
    if (card && this.timer.mode === 'RUNNING') {
      // Don't auto-complete card — user might continue same card next block
    }

    saveState(this.state);


    // Transition to rest
    this.timer.mode = 'RESTING';
    this.timer.restDuration = (this.state.settings.restDuration || 10) * 60;
    this.timer.startTime = Date.now();
    this.timer.elapsedBeforePause = 0;
    document.getElementById('timerArea').classList.remove('running');
    document.getElementById('timerArea').classList.add('resting');
    document.getElementById('btnTimerMain').style.display = 'none';
    document.getElementById('btnTimerPause').style.display = 'none';
    document.getElementById('btnTimerAbandon').style.display = 'none';
    document.getElementById('btnSkipRest').style.display = '';
    document.getElementById('blockGrade').style.display = 'flex';
    document.getElementById('timerDisplay').classList.add('rest-num');
    document.getElementById('timerBlockCount').textContent = '今日' + day.actualBlocks + '卡/' + this.getTodayTarget() + '卡';
    this.toast('块完成 ✓  物证：一张草稿纸/一页习题/一份默写？');
    this.notify('冲刺块完成', '铃响。站起来休息10分钟。');
    this.renderAll();
    this.tick();
    saveTimerSnap(this.timer);
  },

  restComplete() {
    playRestEnd();
    const d = todayStr();
    const day = this.state.days[d];
    this.timer.mode = 'IDLE';
    this.timer.activeCardId = null;
    this._resetTimerIdleUI();
    document.getElementById('timerBlockCount').textContent = `今日${day.actualBlocks}卡/${this.getTodayTarget()}卡`;
    this.renderTodayCards();
    this.toast('休息结束。下一块？');
    this.notify('休息结束', '回到座位，开始下一块。');
    clearTimerSnap();
  },

  gradeLastBlock(grade) {
    const d = todayStr();
    const day = this.state.days[d];
    const blocks = day.blocks;
    if (blocks.length === 0) return;
    blocks[blocks.length - 1].grade = grade;
    saveState(this.state);
    document.getElementById('blockGrade').style.display = 'none';
    const msg = grade === 'up' ? '已标记 ↑ 偏易 — 下次写大一些' : grade === 'down' ? '已标记 ↓ 偏难 — 下次写小一些' : '已标记 — 适中 — 难度不变';
    this.toast(msg);
  },

  skipRest() {
    if (!confirm('跳过休息？休息是系统红线——跳过休息会暗中削弱下一块的注意力。确定跳过？')) return;
    if (this.timer.intervalId) clearTimeout(this.timer.intervalId);
    this.restComplete();
  },

  tick() {
    if (this.timer.intervalId) clearTimeout(this.timer.intervalId);
    const self = this;

    function update() {
      const isRunning = self.timer.mode === 'RUNNING';
      const duration = isRunning ? self.timer.totalDuration : self.timer.restDuration;
      const elapsed = self.timer.elapsedBeforePause + (Date.now() - self.timer.startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      const mins = Math.floor(remaining / 60);
      const secs = Math.floor(remaining % 60);
      document.getElementById('timerDisplay').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      document.getElementById('timerProgress').style.strokeDashoffset = 276.460 * (1 - remaining / duration);
      if (self._immersiveActive()) self.updateImmersiveDisplay();
      if (self._miniWindow && self._miniWindow.classList.contains('show')) self.updateMiniTime(mins, secs, remaining / duration);

      if (remaining <= 0) {
        isRunning ? self.blockComplete() : self.restComplete();
        return;
      }
      self.timer.intervalId = setTimeout(update, 1000);
    }

    if (this.timer.mode === 'RUNNING' || this.timer.mode === 'RESTING') update();
  },

  startTimerTick() {
    // Just to ensure tick is called when needed via UI actions
  },

  // ============================================================
  // WAKE LOCK — keep screen on during blocks
  // ============================================================
  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLock.addEventListener('release', () => {
        if (this.timer.mode === 'RUNNING') this.requestWakeLock();
      });
    } catch (e) {}
  },

  releaseWakeLock() {
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
  },

  // ============================================================
  // NOTIFICATIONS — block / rest end alerts when tab hidden
  // ============================================================
  requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { this._notificationsOk = true; return; }
    if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(r => { this._notificationsOk = r === 'granted'; });
    }
  },

  notify(title, body) {
    if (!this._notificationsOk || document.visibilityState === 'visible') return;
    try { new Notification(title, { body, silent: false }); } catch (e) {}
  },

  // ============================================================
  // WEB WORKER — consistent timer tick even in background
  // ============================================================
  initTimerWorker() {
    try {
      const code = `let id=null;self.onmessage=e=>{if(e.data==='start'){if(id)clearInterval(id);id=setInterval(()=>self.postMessage('tick'),1000)}else if(e.data==='stop'&&id){clearInterval(id);id=null}};`;
      const blob = new Blob([code], { type: 'application/javascript' });
      this._timerWorker = new Worker(URL.createObjectURL(blob));
      this._timerWorker.onmessage = () => this.tick();
    } catch (e) {}
  },

  startWorkerTick() { this._timerWorker?.postMessage('start'); },
  stopWorkerTick() { this._timerWorker?.postMessage('stop'); },

  // ============================================================
  // IMMERSIVE MODE
  // ============================================================
  _inactivityId: null, _burninId: null, _burninX: 0, _burninY: 0,

  initInactivityDetector() {
    const reset = () => {
      if (this._inactivityId) clearTimeout(this._inactivityId);
      if (this.timer.mode !== 'RUNNING' || this._immersiveActive()) return;
      this._inactivityId = setTimeout(() => this.enterImmersive(), 30000);
    };
    for (const evt of ['mousemove','mousedown','keydown','touchstart','scroll']) {
      document.addEventListener(evt, reset, { passive: true });
    }
    reset();
  },

  initImmersiveButtons() {
    const el = id => document.getElementById(id);
    el('immersiveAbandon').onclick = () => { this.exitImmersive(); this.releaseWakeLock(); this.stopWorkerTick(); this.showAbandonDialog(); };
    el('immersivePause').onclick = () => { this.exitImmersive(); this.timerPause(); };
    el('immersiveBackup').onclick = () => this.toggleImmersiveBackupPanel();
    el('immersiveParking').onclick = () => this.toggleImmersiveParkingPanel();
    el('immersiveParkingConfirm').onclick = () => this.confirmImmersiveParkingItem();
    el('immersiveParkingInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.confirmImmersiveParkingItem(); }
      if (e.key === 'Escape') this.closeImmersiveParkingPanel();
    });
    el('immersiveOverlay').onclick = e => { if (e.target === el('immersiveOverlay')) this.exitImmersive(); };
  },

  _immersiveActive() { return document.getElementById('immersiveOverlay').classList.contains('active'); },

  enterImmersive() {
    if (this.timer.mode !== 'RUNNING' || this._immersiveActive()) return;
    document.getElementById('immersiveOverlay').classList.add('active');
    document.getElementById('immersiveBackupPanel').classList.remove('open');
    this.updateImmersiveDisplay();
    const card = this.state.cards[this.timer.activeCardId];
    document.getElementById('immersiveCardRef').textContent = card?.text ?? '';
    this._burninX = 0; this._burninY = 0;
    this._burninId = setInterval(() => this.shiftBurnin(), 60000);
  },

  exitImmersive() {
    const el = id => document.getElementById(id);
    el('immersiveOverlay').classList.remove('active');
    el('immersiveBackupPanel').classList.remove('open');
    el('immersiveParkingPanel').classList.remove('open');
    if (this._burninId) { clearInterval(this._burninId); this._burninId = null; }
    el('immersiveRingWrap').style.transform = 'translate(0, 0)';
    this._burninX = 0; this._burninY = 0;
    if (this._inactivityId) clearTimeout(this._inactivityId);
    if (this.timer.mode === 'RUNNING') this.initInactivityDetector();
  },

  shiftBurnin() {
    this._burninX = Math.max(-6, Math.min(6, this._burninX + (Math.random() - 0.5) * 8));
    this._burninY = Math.max(-6, Math.min(6, this._burninY + (Math.random() - 0.5) * 8));
    document.getElementById('immersiveRingWrap').style.transform =
      `translate(${this._burninX.toFixed(1)}px, ${this._burninY.toFixed(1)}px)`;
  },

  updateImmersiveDisplay() {
    if (!this._immersiveActive()) return;
    const elapsed = this.timer.elapsedBeforePause + (Date.now() - this.timer.startTime) / 1000;
    const remaining = Math.max(0, this.timer.totalDuration - elapsed);
    const m = Math.floor(remaining / 60), s = Math.floor(remaining % 60);
    document.getElementById('immersiveTime').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    document.getElementById('immersiveProgress').style.strokeDashoffset = 276.460 * (1 - remaining / this.timer.totalDuration);
  },

  toggleImmersiveBackupPanel() {
    const panel = document.getElementById('immersiveBackupPanel');
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    document.getElementById('immersiveBackupList').innerHTML = this.state.backupCards.map((b, i) => `
      <div class="immersive-backup-item" onclick="App.selectImmersiveBackupCard(${i})">
        <span class="dot" style="background:${SUBJECT_COLORS[b.subject] || '#6B9A80'};"></span>
        <span style="flex:1;">${this.escapeHtml(b.text)}</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.3);">${SUBJECT_NAMES[b.subject]}</span>
        <span style="color:rgba(255,255,255,0.25);">→</span>
      </div>`).join('');
    panel.classList.add('open');
  },

  selectImmersiveBackupCard(i) {
    this.timer.backupCardId = 'backup_' + i;
    document.getElementById('immersiveBackupPanel').classList.remove('open');
    const card = this.state.backupCards[i];
    document.getElementById('immersiveCardRef').textContent = (card?.text ?? '后备卡') + ' （后备）';
    this.toast('后备卡已激活，块结束后会记录');
  },

  toggleImmersiveParkingPanel() {
    const panel = document.getElementById('immersiveParkingPanel');
    if (panel.classList.contains('open')) { this.closeImmersiveParkingPanel(); return; }
    document.getElementById('immersiveBackupPanel').classList.remove('open');
    document.getElementById('immersiveParkingInput').value = '';
    panel.classList.add('open');
    setTimeout(() => document.getElementById('immersiveParkingInput').focus(), 150);
  },

  closeImmersiveParkingPanel() { document.getElementById('immersiveParkingPanel').classList.remove('open'); },

  confirmImmersiveParkingItem() {
    const input = document.getElementById('immersiveParkingInput');
    const text = input.value.trim();
    if (!text) { this.closeImmersiveParkingPanel(); return; }
    if (!this.state.parkingLot) this.state.parkingLot = [];
    this.state.parkingLot.push({ text, createdAt: todayStr() });
    saveState(this.state);
    input.value = '';
    this.closeImmersiveParkingPanel();
    this.toast('已存入停车场');
  },

  showParkingLot() {
    this.closeAll();
    const items = this.state.parkingLot || [];
    let html = '<h3 style="margin-bottom:12px;">停车场（杂事收集）</h3>';
    if (items.length === 0) {
      html += '<div class="pool-empty">停车场为空</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">';
      items.forEach((item, i) => {
        const isDone = !!item.completedAt;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);${isDone ? 'opacity:0.5;' : ''}">
          <span style="flex:1;font-size:14px;${isDone ? 'text-decoration:line-through;' : ''}">${this.escapeHtml(item.text)}</span>
          <div style="display:flex;gap:4px;flex-shrink:0;margin-left:8px;">
            ${isDone ? '<span style="font-size:11px;color:var(--text-muted);">✓ 已完成</span>' : `
            <button class="ttl-btn" onclick="App.completeParkingLotItem(${i})">完成</button>
            <button class="ttl-btn" onclick="App.deleteParkingLotItem(${i})" style="color:#B8443A;">删除</button>`}
          </div>
        </div>`;
      });
      html += '</div>';
    }
    html += `<div style="margin-top:10px;display:flex;gap:8px;">
      <input type="text" id="newParkingLotText" placeholder="新杂事..." style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:6px;">
      <button class="btn btn-primary" onclick="App.addParkingLotItem()">添加</button>
    </div>`;
    this.showFloatPanel('停车场', html);
  },

  addParkingLotItem() {
    const text = document.getElementById('newParkingLotText')?.value.trim();
    if (!text) return;
    if (!this.state.parkingLot) this.state.parkingLot = [];
    this.state.parkingLot.push({ text, createdAt: todayStr() });
    saveState(this.state);
    this.showParkingLot();
    this.toast('已添加');
  },

  deleteParkingLotItem(i) {
    const item = this.state.parkingLot?.[i];
    if (!item) return;
    this.showConfirmDialog(
      '确认删除',
      `确认删除停车场条目「${item.text}」？`,
      () => {
        this.state.parkingLot.splice(i, 1);
        saveState(this.state);
        this.showParkingLot();
        this.toast('已删除');
      }
    );
  },

  completeParkingLotItem(i) {
    const item = this.state.parkingLot?.[i];
    if (!item) return;
    this.showConfirmDialog(
      '确认完成',
      `确认完成停车场条目「${item.text}」？`,
      () => {
        // Mark as completed and keep for summary
        item.completedAt = todayStr();
        saveState(this.state);
        this.showParkingLot();
        this.toast('已完成 ✓');
      }
    );
  },

  // ============================================================
  // CARDS
  // ============================================================
  showCreateCard(presetText) {
    this.closeAll();
    document.getElementById('createCardText').value = presetText || '';
    document.getElementById('createCharCount').textContent = `${(presetText || '').length} / 25`;
    this.renderCreateSubject();
    this.renderCreateType();
    this.renderCreateZone();
    this.onCreateTextChange();
    document.getElementById('floatCreateCard').classList.add('show');
    this.currentFloat = 'createCard';
    const ov = document.getElementById('overlay'); ov.style.opacity = ''; ov.style.transition = ''; ov.classList.add('show');
    setTimeout(() => document.getElementById('createCardText').focus(), 150);
  },

  closeCreateCard() {
    document.getElementById('floatCreateCard').classList.remove('show');
    this.currentFloat = null;
    document.getElementById('overlay').classList.remove('show');
  },

  renderCreateSubject() {
    const container = document.getElementById('createSubject');
    const canDelete = SUBJECTS.length > 1;
    container.innerHTML = SUBJECTS.map(s => {
      const delBtn = canDelete ? `<span class="chip-del" onclick="event.stopPropagation();App.deleteSubject('${s}')" title="删除">×</span>` : '';
      return `<div class="chip ${PRESET_SUBJECTS.includes(s) ? s : ''}" data-subject="${s}" onclick="App.selectCreateSubject('${s}', this)" style="border-left:3px solid ${SUBJECT_COLORS[s]}">${SUBJECT_NAMES[s]}${delBtn}</div>`;
    }).join('') + `<div class="chip chip-add" onclick="App.promptCustomSubject()">＋</div>`;
    container.querySelector('.chip')?.classList.add('selected');
  },

  renderCreateType() {
    const container = document.getElementById('createType');
    container.innerHTML = `
      <div class="chip selected" data-type="output" onclick="App.selectCreateType('output', this)">● 输出型</div>
      <div class="chip" data-type="input" onclick="App.selectCreateType('input', this)">○ 输入型</div>`;
  },

  renderCreateZone() {
    const container = document.getElementById('createZone');
    const todayCount = this.getTodayCardsRaw().length;
    const maxCards = this.getTodayTarget();
    const todayDisabled = todayCount >= maxCards;
    container.innerHTML = `
      <div class="chip selected" data-zone="pool" onclick="App.selectCreateZone('pool', this)">任务池</div>
      <div class="chip" data-zone="today" onclick="App.selectCreateZone('today', this)" ${todayDisabled ? 'style="opacity:0.4;pointer-events:none;"' : ''}>今日区${todayDisabled ? ` (已满·${maxCards}张)` : ''}</div>
      <div class="chip" data-zone="exposure" onclick="App.selectCreateZone('exposure', this)">接触区</div>`;

    this.renderCreateLevel();
  },

  renderCreateLevel() {
    const container = document.getElementById('createLevel');
    if (!container) return;
    const levels = ['L0','L1','L2','L3','L4','L5','L6'];
    container.innerHTML = levels.map((l, i) =>
      `<div class="chip ${i === 0 ? 'selected' : ''}" data-level="${i}" onclick="App.selectCreateLevel(${i}, this)">${l}</div>`
    ).join('');
  },

  _selectChip(el) { el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('selected')); el.classList.add('selected'); },
  selectCreateSubject(subj, el) { this._selectChip(el); },
  selectCreateType(type, el) { this._selectChip(el); },
  selectCreateZone(zone, el) { this._selectChip(el); const lf = document.getElementById('createExposureLevel'); if (lf) lf.style.display = zone === 'exposure' ? '' : 'none'; },
  selectCreateLevel(level, el) { this._selectChip(el); },

  onCreateTextChange() {
    const text = document.getElementById('createCardText').value;
    document.getElementById('createCharCount').textContent = `${text.length} / 25`;
    document.getElementById('createCharCount').className = text.length > 20 ? 'char-count warn' : 'char-count';

    const banHint = document.getElementById('banHint');
    const hasForbidden = FORBIDDEN_WORDS.some(w => text.includes(w));
    banHint.className = hasForbidden ? 'ban-hint show' : 'ban-hint';
    if (hasForbidden) banHint.textContent = '包含模糊动词，请改为具体物理动作';
    document.getElementById('btnCreateCard').disabled = hasForbidden || text.length === 0;

    const result = document.getElementById('secTestResult');
    if (text.length === 0) {
      result.innerHTML = ''; result.className = 'result';
    } else if (hasForbidden) {
      result.innerHTML = '❌ 包含模糊动词，无法启动'; result.className = 'result fail';
    } else if (text.length <= 3) {
      result.innerHTML = '⚠ 太短，能更具体吗？'; result.className = 'result';
    } else {
      const actionVerbs = ['打开','翻到','写下','抄写','朗读','圈出','标注','做第','闭卷','限时','翻译','默写','画出','写出','读'];
      const hasAction = actionVerbs.some(v => text.includes(v));
      if (hasAction) {
        result.innerHTML = '✓ 似乎可以在 10 秒内开始'; result.className = 'result pass';
      } else {
        result.innerHTML = '⚠ 缺少具体动作词，试试"打开/写下/做第X题"'; result.className = 'result';
      }
    }
  },

  doCreateCard() {
    const text = document.getElementById('createCardText').value.trim();
    if (!text || text.length > 25 || FORBIDDEN_WORDS.some(w => text.includes(w))) return;

    const $ = sel => document.querySelector(sel)?.dataset;
    const subject = $('#createSubject .chip.selected')?.subject || 'math';
    const type = $('#createType .chip.selected')?.type || 'output';
    const zone = $('#createZone .chip.selected')?.zone || 'pool';
    const level = zone === 'exposure' ? parseInt($('#createLevel .chip.selected')?.level || 0) : null;

    if (zone === 'today' && this.getTodayCardsRaw().length >= this.getTodayTarget()) {
      this.toast(`今日区已满（最多 ${this.getTodayTarget()} 张）`); return;
    }
    if (zone === 'pool' && this.getPoolCards().length >= 20) {
      this.toast('任务池已满（最多 20 张），请先移除一张'); return;
    }

    this.state.cards[uid()] = { text, subject, type: zone === 'exposure' ? 'input' : type, level, zone, createdAt: todayStr(), completedAt: null };
    saveState(this.state);
    this.closeCreateCard();
    this.renderAll();
    const zoneLabel = { today: '今日区', pool: '任务池', exposure: '接触区' };
    this.toast(`卡已创建 → ${zoneLabel[zone] || zone}`);
  },

  moveCardToToday(cardId) {
    const todayCards = this.getTodayCardsRaw();
    const maxCards = this.getTodayTarget();
    if (todayCards.length >= maxCards) { this.toast('今日区已满'); return; }
    this.state.cards[cardId].zone = 'today';
    // If was stuck in pool over 14 days, reset the clock by updating createdAt
    saveState(this.state);
    this.renderAll();
    if (this.currentFloat === 'cardPicker') this.showCardPicker(this.cardPickerSlot);
    this.toast('已移入今日区');
  },

  completeCard(cardId) {
    const card = this.state.cards[cardId];
    if (!card || card.completedAt) return;
    card.completedAt = todayStr();
    card.zone = 'completed';
    saveState(this.state);
    this.renderTodayCards();
    this.toast('卡片完成 ✓');
  },

  selectTimerCard(cardId) {
    const card = this.state.cards[cardId];
    if (!card || card.completedAt) return;

    if (card.zone === 'pool') {
      if (this.getTodayCardsRaw().length >= this.getTodayTarget()) { this.toast('今日区已满，请先移除一张'); return; }
      card.zone = 'today';
    }

    this.timer.activeCardId = cardId;
    this.timer.backupCardId = null;
    const ref = document.getElementById('timerCardRef');
    ref.textContent = card.text; ref.classList.remove('empty');
    ref.style.borderLeftColor = SUBJECT_COLORS[card.subject] || 'var(--timer-accent)';
    if (this.timer.mode === 'RUNNING') document.getElementById('immersiveCardRef').textContent = card.text;

    saveState(this.state);
    this.renderAll();
    if (this.currentDrawer === 'pool') this.renderPoolCards();
    this.toast(`已选中：${card.text}`);
  },

  // Long-press / right-click context menu
  _cardLongPressTimer: null, _cardLongPressId: null,

  _cardTouchStart(e, cardId) {
    if (e.touches.length !== 1) return;
    this._cardLongPressId = cardId;
    this._cardLongPressTimer = setTimeout(() => {
      document.querySelector(`[data-card-id="${cardId}"]`)?.classList.add('long-pressing');
      this.showCardContextMenu(cardId, e.touches[0]);
      this._cardLongPressTimer = null;
    }, this._isMobile() ? 700 : 600);
  },

  _cardTouchEnd(e, cardId) { this._cancelLongPress(cardId); },
  _cardTouchMove() { if (this._cardLongPressTimer) { clearTimeout(this._cardLongPressTimer); this._cardLongPressTimer = null; } const el = this._cardLongPressId ? document.querySelector(`[data-card-id="${this._cardLongPressId}"]`) : null; el?.classList.remove('long-pressing'); },

  _cardMouseDown(e, cardId) {
    if (e.button !== 0) return;
    this._cardLongPressId = cardId;
    this._cardLongPressTimer = setTimeout(() => {
      document.querySelector(`[data-card-id="${cardId}"]`)?.classList.add('long-pressing');
      this.showCardContextMenu(cardId, e);
      this._cardLongPressTimer = null;
    }, this._isMobile() ? 700 : 600);
  },
  _cardMouseUp(cardId) { this._cancelLongPress(cardId); },

  _cancelLongPress(cardId) {
    if (this._cardLongPressTimer) { clearTimeout(this._cardLongPressTimer); this._cardLongPressTimer = null; }
    document.querySelector(`[data-card-id="${cardId}"]`)?.classList.remove('long-pressing');
    this._cardLongPressId = null;
  },

  showCardContextMenu(cardId, e) {
    this.closeContextMenu();
    this.closeConfirmDialog();
    if (!this.state.cards[cardId]) return;

    const menu = document.getElementById('cardContextMenu');
    menu.dataset.cardId = cardId;
    this._contextMenuCardId = cardId;

    if (this._isMobile()) {
      menu.style.left = '0'; menu.style.right = '0'; menu.style.top = 'auto'; menu.style.bottom = '0';
      menu.style.width = '100vw'; menu.style.borderRadius = '18px 18px 0 0';
      menu.style.transform = 'translateY(100%)';
      menu.classList.add('show');
      requestAnimationFrame(() => { menu.style.transition = 'transform 0.35s var(--ease-spring)'; menu.style.transform = 'translateY(0)'; });
    } else {
      menu.style.left = ''; menu.style.right = ''; menu.style.top = ''; menu.style.bottom = ''; menu.style.width = ''; menu.style.borderRadius = ''; menu.style.transform = '';
      const pt = e.touches ? e.touches[0] : e;
      const x = pt?.clientX || e.pageX || 100, y = pt?.clientY || e.pageY || 200;
      menu.style.left = Math.min(x, window.innerWidth - 192) + 'px';
      menu.style.top = Math.min(y, window.innerHeight - 132) + 'px';
      menu.classList.add('show');
    }

    setTimeout(() => {
      const closer = ev => { if (!menu.contains(ev.target)) { this.closeContextMenu(); document.removeEventListener('click', closer); } };
      document.addEventListener('click', closer);
    }, 50);
  },

  closeContextMenu() {
    const menu = document.getElementById('cardContextMenu');
    if (this._isMobile() && menu.classList.contains('show')) {
      menu.style.transform = 'translateY(100%)';
      setTimeout(() => { menu.classList.remove('show'); menu.style.transform = ''; menu.style.transition = ''; }, 260);
    } else {
      menu.classList.remove('show');
    }
    this._contextMenuCardId = null;
  },

  _clearActiveCardRef() {
    this.timer.activeCardId = null;
    const ref = document.getElementById('timerCardRef');
    ref.textContent = '选择卡片后开始'; ref.classList.add('empty');
    ref.style.borderLeftColor = 'var(--border)';
  },

  markCardComplete(cardId) {
    this.closeContextMenu();
    const card = this.state.cards[cardId];
    if (!card) return;
    this.showConfirmDialog('确认完成任务',
      `确认完成任务「${card.text}」？<br><span style="font-size:12px;color:var(--text-muted);">完成后的块记录将被保留。</span>`,
      () => this.doMarkComplete(cardId));
  },

  doMarkComplete(cardId) {
    const card = this.state.cards[cardId];
    if (!card) return;
    card.completedAt = todayStr(); card.zone = 'completed';
    if (this.timer.activeCardId === cardId) this._clearActiveCardRef();
    saveState(this.state);
    this.renderAll();
    if (this.currentDrawer === 'pool') this.renderPoolCards();
    this.toast(`已完成：${card.text}`);
  },

  deleteCard(cardId) {
    this.closeContextMenu();
    const card = this.state.cards[cardId];
    if (!card) return;
    const blocks = (this.state.days[todayStr()]?.blocks || []).filter(b => b.cardId === cardId);
    const blockMsg = blocks.length > 0
      ? `<br><span style="font-size:12px;color:#B8443A;">将同时移除今日与此卡关联的 ${blocks.length} 个时间块记录。</span>`
      : `<br><span style="font-size:12px;color:var(--text-muted);">该任务下无关联的时间块记录。</span>`;
    this.showConfirmDialog('确认删除任务', `确认删除任务「${card.text}」？${blockMsg}`, () => this.doDeleteCard(cardId));
  },

  doDeleteCard(cardId) {
    const day = this.state.days[todayStr()];
    if (day?.blocks) { day.blocks = day.blocks.filter(b => b.cardId !== cardId); day.actualBlocks = day.blocks.length; }
    if (this.timer.activeCardId === cardId) this._clearActiveCardRef();
    delete this.state.cards[cardId];
    saveState(this.state);
    this.renderAll();
    if (this.currentDrawer === 'pool') this.renderPoolCards();
    this.toast('卡片已删除');
  },

  showConfirmDialog(title, message, onConfirm) {
    this.closeConfirmDialog();
    const dialog = document.getElementById('confirmDialog');
    document.getElementById('confirmDialogTitle').textContent = title;
    document.getElementById('confirmDialogMsg').innerHTML = message;
    document.getElementById('confirmDialogYes').onclick = () => { onConfirm(); this.closeConfirmDialog(); };
    document.getElementById('confirmDialogNo').onclick = () => this.closeConfirmDialog();
    dialog.classList.add('show');
  },

  closeConfirmDialog() { document.getElementById('confirmDialog').classList.remove('show'); },

  degradeCard(cardId) {
    const card = this.state.cards[cardId];
    if (!card) return;
    card.degraded = true;
    card.level = Math.max(0, (card.level || 5) - 1);
    saveState(this.state);
    if (this.currentFloat === 'cardPicker') this.showCardPicker(this.cardPickerSlot);
    this.renderAll();
    this.toast(`已降级 ↓ ${card.level}级`);
  },

  // ============================================================
  // CARD PICKER (keep for empty slot taps)
  // ============================================================
  showCardPicker(slotIndex) {
    const todayCards = this.getTodayCardsRaw();
    if (todayCards.length >= this.getTodayTarget() && !todayCards[slotIndex]) { this.toast('今日区已满'); return; }

    this.closeAll();
    this.cardPickerSlot = slotIndex;
    const container = document.getElementById('pickerCards');
    const poolCards = this.getPoolCards();
    container.innerHTML = poolCards.length === 0
      ? '<div class="pool-empty">任务池为空，请先创建卡片</div>'
      : poolCards.map(c => `<div class="pool-card ${PRESET_SUBJECTS.includes(c.subject) ? c.subject : ''}" onclick="App.selectTimerCard('${c.id}');App.closeAll();" oncontextmenu="event.preventDefault();App.showCardContextMenu('${c.id}',event)" data-card-id="${c.id}"><div class="pcard-text">${this.escapeHtml(c.text)}</div><div class="pcard-meta">${SUBJECT_NAMES[c.subject]} · ${c.type === 'output' ? '●输出' : '○输入'} · ${this.daysAgo(c.createdAt)}天前</div></div>`).join('');
    document.getElementById('floatCardPicker').classList.add('show');
    this.currentFloat = 'cardPicker';
    const ov = document.getElementById('overlay'); ov.style.opacity = ''; ov.style.transition = ''; ov.classList.add('show');
  },

  // ============================================================
  // DRAWERS
  // ============================================================
  openDrawer(name) {
    this.closeAll();
    this.currentDrawer = name;
    document.getElementById('overlay').classList.add('show');

    const drawerMap = { pool: 'drawerPool', summary: 'drawerSummary', chain: 'drawerChain', more: 'drawerMore' };
    document.getElementById(drawerMap[name]).classList.add('show');
    switch (name) {
      case 'pool': this.renderPoolFilters(); this.renderPoolCards(); break;
      case 'summary': this.renderSummary(); break;
      case 'chain': this.renderChainFull(); break;
      case 'more': this.renderMore(); break;
    }

    if (this._isMobile()) {
      const drawer = document.querySelector('.drawer.show');
      if (drawer && !drawer._swipeBound) {
        drawer._swipeBound = true;
        let startY = 0, closed = false;
        drawer.addEventListener('touchstart', e => { startY = e.touches[0].clientY; closed = false; }, { passive: true });
        drawer.addEventListener('touchmove', e => {
          if (closed) return;
          const atTop = (drawer.querySelector('.drawer-body')?.scrollTop ?? 0) <= 0;
          if (e.touches[0].clientY - startY > 40 && atTop) { closed = true; this.closeAll(); }
        }, { passive: true });
      }
    }
  },

  closeAll() {
    const isMobile = this._isMobile();
    const easeOut = '0.25s cubic-bezier(0.4, 0, 1, 1)';

    for (const d of document.querySelectorAll('.drawer.show')) {
      d.style.transition = `transform ${easeOut}`;
      d.style.transform = isMobile ? 'translateY(100%)' : 'translateX(110%)';
      setTimeout(() => { d.classList.remove('show'); d.style.transform = ''; d.style.transition = ''; }, 260);
    }
    for (const f of document.querySelectorAll('.float-panel.show')) {
      f.style.transition = `all ${easeOut}`;
      if (isMobile) { f.style.transform = 'translateY(100%)'; f.style.opacity = '1'; }
      else { f.style.opacity = '0'; f.style.transform = 'translate(-50%, -50%) scale(0.92)'; }
      setTimeout(() => { f.classList.remove('show'); f.style.opacity = ''; f.style.transform = ''; f.style.transition = ''; }, 260);
    }

    const ov = document.getElementById('overlay');
    ov.style.transition = `opacity ${easeOut}`;
    ov.style.opacity = '0';
    setTimeout(() => {
      if (ov.style.opacity === '0') { ov.classList.remove('show'); ov.style.opacity = ''; ov.style.transition = ''; ov.style.zIndex = ''; }
    }, 260);

    this.currentDrawer = null; this.currentFloat = null;
    this.closeContextMenu(); this.closeConfirmDialog();
  },

  // ============================================================
  // RENDER: Pool Cards
  // ============================================================
  renderPoolFilters() {
    const container = document.getElementById('poolFilters');
    let html = `<button class="pool-filter ${this.poolFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="App.filterPool('all', this)">全部</button>`;
    SUBJECTS.forEach(s => {
      html += `<button class="pool-filter ${this.poolFilter === s ? 'active' : ''}" data-filter="${s}" onclick="App.filterPool('${s}', this)">${SUBJECT_NAMES[s]}</button>`;
    });
    container.innerHTML = html;
  },

  promptCustomSubject() {
    const customs = this.state.customSubjects || [];
    if (customs.length >= 8) { this.toast('最多8个自定义分类'); return; }
    this.closeAll();
    this.showFloatPanel('新建分类', `
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">输入新分类名称（不超过5个字）</p>
      <input type="text" id="newCustomSubjectName" placeholder="例：专业课" maxlength="5" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:6px;margin-bottom:12px;" onkeydown="if(event.key==='Enter')App.confirmCreateCustomSubject()">
      <button class="btn btn-primary" onclick="App.confirmCreateCustomSubject()" style="width:100%;">确定</button>
    `);
    setTimeout(() => document.getElementById('newCustomSubjectName')?.focus(), 150);
  },

  confirmCreateCustomSubject() {
    const input = document.getElementById('newCustomSubjectName');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { this.toast('请输入分类名'); return; }
    if (name.length > 5) { this.toast('分类名不超过5个字'); return; }
    const customs = this.state.customSubjects || [];
    if (customs.find(c => c.name === name)) { this.toast('分类名已存在'); return; }
    this._pendingCustomName = name;
    this.closeAll();
    this.showConfirmDialog('创建分类', `是否创建「${name}」？`, () => this.doCreateCustomSubject());
  },

  doCreateCustomSubject() {
    const name = this._pendingCustomName;
    if (!name) return;
    const customs = this.state.customSubjects || [];
    const key = 'custom_' + Date.now();
    const color = CUSTOM_SUBJECT_COLORS[customs.length % CUSTOM_SUBJECT_COLORS.length];
    customs.push({ key, name, color });
    this.state.customSubjects = customs;
    this._pendingCustomName = null;
    rebuildSubjectLookups(this.state);
    saveState(this.state);
    this.renderCreateSubject();
    this.renderPoolFilters();
    this.toast(`已创建分类「${name}」`);
  },

  deleteSubject(key) {
    if (SUBJECTS.length <= 1) { this.toast('至少保留一个科目'); return; }
    if (PRESET_SUBJECTS.includes(key)) {
      const removed = this.state.removedPresetSubjects || [];
      if (!removed.includes(key)) removed.push(key);
      this.state.removedPresetSubjects = removed;
    } else {
      const customs = this.state.customSubjects || [];
      const idx = customs.findIndex(c => c.key === key);
      if (idx !== -1) customs.splice(idx, 1);
      this.state.customSubjects = customs;
    }
    // Clean up primarySubjects if needed
    const primary = this.state.primarySubjects || [];
    if (primary.includes(key)) {
      this.state.primarySubjects = primary.filter(s => s !== key);
    }
    rebuildSubjectLookups(this.state);
    saveState(this.state);
    this.renderCreateSubject();
    this.renderPoolFilters();
    this.toast(`已删除科目「${SUBJECT_NAMES[key] || key}」`);
  },

  renderPoolCards() {
    const container = document.getElementById('poolCards');
    const empty = document.getElementById('poolEmpty');
    const cards = this.getPoolCards(this.poolFilter);

    if (cards.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      container.innerHTML = cards.map(c => {
        const daysOld = this.daysAgo(c.createdAt);
        const ttlWarn = daysOld >= 14;
        return `
          <div class="pool-card ${PRESET_SUBJECTS.includes(c.subject) ? c.subject : ''}" style="border-left-color:${SUBJECT_COLORS[c.subject] || '#aaa'}" onclick="App.selectTimerCard('${c.id}')" oncontextmenu="event.preventDefault();App.showCardContextMenu('${c.id}',event)" data-card-id="${c.id}" onmousedown="App._cardMouseDown(event,'${c.id}')" onmouseup="App._cardMouseUp('${c.id}')" ontouchstart="App._cardTouchStart(event,'${c.id}')" ontouchend="App._cardTouchEnd(event,'${c.id}')" ontouchmove="App._cardTouchMove()">
            <div class="pcard-text">${this.escapeHtml(c.text)}</div>
            <div class="pcard-meta">${SUBJECT_NAMES[c.subject]} · ${c.type === 'output' ? '●输出' : '○输入'} · ${daysOld}天前</div>
            ${ttlWarn ? `<div class="ttl-warn">
              ⚠ ${daysOld}天未动 —
              <button class="ttl-btn" onclick="event.stopPropagation();App.selectTimerCard('${c.id}')">移入今日</button>
              <button class="ttl-btn" onclick="event.stopPropagation();App.showCardContextMenu('${c.id}',event)">操作</button>
            </div>` : ''}
            <div style="margin-top:6px;display:flex;gap:6px;">
              <button class="ttl-btn" onclick="event.stopPropagation();App.selectTimerCard('${c.id}')" style="font-size:11px;">→ 今日区</button>
              <button class="ttl-btn" onclick="event.stopPropagation();App.showCardContextMenu('${c.id}',event)" style="font-size:11px;">操作</button>
            </div>
          </div>`;
      }).join('');
    }
  },

  moveToExposure(cardId) {
    this.state.cards[cardId].zone = 'exposure';
    this.state.cards[cardId].level = 0;
    saveState(this.state);
    this.renderPoolCards();
    this.renderExposure();
    this.toast('已移入接触区 0级');
  },

  filterPool(filter, el) {
    this.poolFilter = filter;
    document.querySelectorAll('#drawerPool .pool-filter').forEach(f => f.classList.remove('active'));
    el.classList.add('active');
    this.renderPoolCards();
  },

  // ============================================================
  // RENDER: Summary
  // ============================================================
  renderSummary(tab) {
    if (tab) this.summaryTab = tab;
    const container = document.getElementById('summaryBody');
    let html = `
      <div class="summary-tabs">
        <button class="summary-tab ${this.summaryTab === 'daily' ? 'active' : ''}" onclick="App.renderSummary('daily')">日</button>
        <button class="summary-tab ${this.summaryTab === 'weekly' ? 'active' : ''}" onclick="App.renderSummary('weekly')">周</button>
        <button class="summary-tab ${this.summaryTab === 'monthly' ? 'active' : ''}" onclick="App.renderSummary('monthly')">月</button>
        <button class="summary-tab ${this.summaryTab === 'yearly' ? 'active' : ''}" onclick="App.renderSummary('yearly')">年</button>
      </div>`;

    if (this.summaryTab === 'daily') html += this.summaryDaily();
    else if (this.summaryTab === 'weekly') html += this.summaryWeekly();
    else if (this.summaryTab === 'monthly') html += this.summaryMonthly();
    else if (this.summaryTab === 'yearly') html += this.summaryYearly();

    container.innerHTML = html;
  },

  summaryDaily() {
    const d = todayStr();
    const day = this.state.days[d] || { signal: null, targetBlocks: 3, actualBlocks: 0, blocks: [], chainStatus: 'zero' };
    const completedToday = Object.values(this.state.cards).filter(c => c.completedAt === d);
    const outputBlocks = day.blocks.filter(b => b.type === 'output').length;
    const exposureCards = Object.entries(this.state.cards).filter(([id, c]) => c.zone === 'exposure').map(([id, c]) => ({ id, ...c }));
    const expLabels = ['物理存在','拿出工具','打开浏览','阅读观察','抄写模仿','单题实战','正常输出'];
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yd = fmtLocal(yesterday);
    const blockDiff = day.actualBlocks - ((this.state.days[yd] || {}).actualBlocks || 0);

    return `<div class="summary-block">
        <h4>${d} · ${['日','一','二','三','四','五','六'][new Date().getDay()]}</h4>
        <div class="summary-row"><span>信号</span><span class="summary-val">${day.signal || '未设置'}</span></div>
        <div class="summary-row"><span>目标卡 / 完成块</span><span class="summary-val">${day.targetBlocks || 3} / ${day.actualBlocks} ${day.actualBlocks >= (day.targetBlocks || 3) ? '✓' : ''}</span></div>
        <div class="summary-row"><span>输出型块</span><span class="summary-val">${outputBlocks} / 要求 ≥2 ${outputBlocks >= 2 ? '✓' : '⚠'}</span></div>
        <div class="summary-row"><span>链状态</span><span class="summary-val">${day.chainStatus === 'full' ? '▓ 满格' : day.chainStatus === 'half' ? '◐ 半格' : '○ 未填'}</span></div>
        <div class="summary-row"><span>今日卡片完成</span><span class="summary-val">${completedToday.length} 张</span></div>
        <div class="summary-row"><span>对比昨日</span><span class="summary-val">${blockDiff >= 0 ? '+' : ''}${blockDiff} 块</span></div>
        ${exposureCards.length > 0 ? `<div class="summary-row"><span>接触区卡片</span><span class="summary-val">${exposureCards.length} 张</span></div>
        ${exposureCards.map(c => `<div class="summary-row"><span style="font-size:11px;padding-left:8px;">└ ${this.escapeHtml(c.text)}</span><span class="summary-val" style="font-size:11px;">${SUBJECT_NAMES[c.subject]} · Lv${c.level ?? 0} ${expLabels[c.level ?? 0]}</span></div>`).join('')}` : ''}
        <div class="summary-row"><span>停车场：完成 / 收集</span><span class="summary-val">${(this.state.parkingLot || []).filter(p => p.completedAt === d).length} / ${(this.state.parkingLot || []).filter(p => p.createdAt === d).length}</span></div>
      </div>
      ${day.blocks.length > 0 ? `<div class="summary-block"><h4>块记录</h4>${day.blocks.map(b => `<div class="summary-row"><span>${b.startTime} ${SUBJECT_NAMES[b.subject]}${b.backupCardId ? ' + 后备卡' : ''}${b.grade === 'up' ? ' ↑' : b.grade === 'down' ? ' ↓' : ''}</span><span class="summary-val">${b.type === 'output' ? '●' : '○'} ${b.duration}分钟</span></div>`).join('')}</div>` : ''}`;
  },

  _subjBreakdown(totalBlocks, subjectCount) {
    const primary = this.getPrimarySubjects();
    let html = '', otherCount = 0;
    for (const s of SUBJECTS) {
      const pct = totalBlocks > 0 ? Math.round(subjectCount[s] / totalBlocks * 100) : 0;
      if (primary.includes(s)) {
        html += `<div class="subj-bar"><span class="sb-label">⭐ ${SUBJECT_NAMES[s]}</span><div class="sb-track"><div class="sb-fill" style="width:${pct}%;background:${SUBJECT_COLORS[s]};"></div></div><span class="sb-pct">${subjectCount[s]}块 (${pct}%)</span></div>`;
      } else otherCount += subjectCount[s];
    }
    if (otherCount > 0) {
      const opct = totalBlocks > 0 ? Math.round(otherCount / totalBlocks * 100) : 0;
      html += `<div class="subj-bar" style="opacity:0.6;"><span class="sb-label">其他</span><div class="sb-track"><div class="sb-fill" style="width:${opct}%;background:#aaa;"></div></div><span class="sb-pct">${otherCount}块 (${opct}%)</span></div>`;
    }
    return html;
  },

  summaryWeekly() {
    const now = new Date();
    const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() || 7) + 1);
    const days = [];
    let totalBlocks = 0, totalTarget = 0;
    const subjectCount = {}; SUBJECTS.forEach(s => { subjectCount[s] = 0; });

    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday); dt.setDate(monday.getDate() + i);
      const ds = fmtLocal(dt);
      const day = this.state.days[ds] || { actualBlocks: 0, targetBlocks: 3, blocks: [] };
      days.push({ day, label: ['一','二','三','四','五','六','日'][i] });
      totalBlocks += day.actualBlocks;
      totalTarget += (day.targetBlocks || 3);
      for (const b of (day.blocks || [])) { if (subjectCount[b.subject] !== undefined) subjectCount[b.subject]++; }
    }

    const maxBlocks = Math.max(7, ...days.map(d => d.day.actualBlocks));
    let html = `<div class="summary-block"><h4>本周总块数: ${totalBlocks} / 目标 ${totalTarget}</h4></div>`;
    html += `<div class="summary-block"><h4>每日块数</h4><div class="bar-chart">`;
    for (const d of days) html += `<div class="bar-col"><div class="bar-fill" style="height:${(d.day.actualBlocks / maxBlocks) * 80}px;background:var(--math);"></div><div class="bar-label">${d.label}<br>${d.day.actualBlocks}</div></div>`;
    html += `</div></div><div class="summary-block"><h4>科目分布</h4>${this._subjBreakdown(totalBlocks, subjectCount)}</div>`;
    return html;
  },

  summaryMonthly() {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth(), daysInMonth = new Date(year, month + 1, 0).getDate();
    let totalBlocks = 0, totalDays = 0;
    const subjectCount = {}; SUBJECTS.forEach(s => { subjectCount[s] = 0; });
    const weeks = [[],[],[],[],[]];
    let weekIdx = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const day = this.state.days[ds];
      const blocks = day?.actualBlocks ?? 0;
      if (blocks > 0) totalDays++;
      totalBlocks += blocks;
      if (day) for (const b of (day.blocks || [])) { if (subjectCount[b.subject] !== undefined) subjectCount[b.subject]++; }
      const dt = new Date(year, month, d);
      if (((dt.getDay() || 7) === 1 && d > 1)) weekIdx++;
      if (!weeks[weekIdx]) weeks[weekIdx] = [];
      weeks[weekIdx].push({ d, blocks });
    }

    let html = `<div class="summary-block"><h4>${year}年${month+1}月</h4>`;
    html += `<div class="summary-row"><span>总块数</span><span class="summary-val">${totalBlocks}</span></div>`;
    html += `<div class="summary-row"><span>非零天数</span><span class="summary-val">${totalDays} / ${daysInMonth}</span></div>`;
    html += `<div class="summary-row"><span>日均块数</span><span class="summary-val">${(totalBlocks / daysInMonth).toFixed(1)}</span></div></div>`;

    html += `<div class="summary-block"><h4>每周块数</h4><div class="bar-chart">`;
    for (const [i, w] of weeks.entries()) {
      const wTotal = w.reduce((s, d) => s + d.blocks, 0);
      html += `<div class="bar-col"><div class="bar-fill" style="height:${Math.min(90, wTotal * 3)}px;background:var(--timer-accent);"></div><div class="bar-label">W${i+1}<br>${wTotal}</div></div>`;
    }
    html += `</div></div><div class="summary-block"><h4>科目分布</h4>${this._subjBreakdown(totalBlocks, subjectCount)}</div>`;
    return html;
  },

  summaryYearly() {
    const sortedDays = Object.entries(this.state.days).sort((a, b) => a[0].localeCompare(b[0]));
    let totalBlocks = 0, fullDays = 0, halfDays = 0, zeroDays = 0, longestStreak = 0, currentStreak = 0;
    const subjectCount = {}; SUBJECTS.forEach(s => { subjectCount[s] = 0; });

    for (const [ds, day] of sortedDays) {
      totalBlocks += day.actualBlocks || 0;
      if (day.chainStatus === 'full') { fullDays++; currentStreak++; }
      else if (day.chainStatus === 'half') { halfDays++; currentStreak++; }
      else { zeroDays++; longestStreak = Math.max(longestStreak, currentStreak); currentStreak = 0; }
      for (const b of (day.blocks || [])) { if (subjectCount[b.subject] !== undefined) subjectCount[b.subject]++; }
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    const startDate = this.state.startDate || todayStr();
    const totalPossible = Math.max(1, Math.ceil((new Date() - new Date(startDate)) / 86400000) + 1);
    const daysUntilExam = Math.max(0, Math.ceil((new Date('2026-12-20') - new Date()) / 86400000));

    let html = `<div class="summary-block"><h4>全周期统计</h4>`;
    html += `<div class="summary-row"><span>累计总块数</span><span class="summary-val">${totalBlocks}</span></div>`;
    html += `<div class="summary-row"><span>总天数</span><span class="summary-val">${totalPossible} 天</span></div>`;
    html += `<div class="summary-row"><span>满格率</span><span class="summary-val">${(fullDays / totalPossible * 100).toFixed(0)}%</span></div>`;
    html += `<div class="summary-row"><span>最长连续天数</span><span class="summary-val">${longestStreak} 天</span></div>`;
    html += `<div class="summary-row"><span>距初试还有</span><span class="summary-val">${daysUntilExam} 天</span></div></div>`;
    html += `<div class="summary-block"><h4>科目累计分布</h4>${this._subjBreakdown(totalBlocks, subjectCount)}</div>`;

    if (totalBlocks > 0 && daysUntilExam > 0) {
      const dailyAvg = totalBlocks / Math.max(1, totalPossible);
      const projected = Math.round(dailyAvg * daysUntilExam + totalBlocks);
      html += `<div class="summary-block"><h4>预测</h4>
        <div class="summary-row"><span>日均块数</span><span class="summary-val">${dailyAvg.toFixed(1)}</span></div>
        <div class="summary-row"><span>预估考前总块数</span><span class="summary-val">${projected} 块</span></div>
        <div class="summary-row"><span>预估总学时</span><span class="summary-val">约 ${Math.round(projected * 50 / 60)} 小时</span></div></div>`;
    }
    return html;
  },

  // ============================================================
  // RENDER: Chain Full
  // ============================================================
  renderChainFull() {
    const allDays = Object.entries(this.state.days).sort((a, b) => a[0].localeCompare(b[0]));
    let full = 0, half = 0, zero = 0, streak = 0, maxStreak = 0;
    for (const [ds, day] of allDays) {
      if (day.chainStatus === 'full') { full++; streak++; }
      else if (day.chainStatus === 'half') { half++; streak++; }
      else { zero++; maxStreak = Math.max(maxStreak, streak); streak = 0; }
    }
    maxStreak = Math.max(maxStreak, streak);

    const grid = document.getElementById('chainFullGrid');
    const startDate = new Date(this.state.startDate || todayStr());
    const endDate = new Date(2026, 11, 31);
    const totalDays = Math.max(1, Math.ceil((endDate - startDate) / 86400000) + 1);
    let cells = '', currentMonth = -1;

    for (let i = 0; i < totalDays; i++) {
      const dt = new Date(startDate); dt.setDate(startDate.getDate() + i);
      const ds = fmtLocal(dt);
      const day = this.state.days[ds];
      const status = day?.chainStatus ?? (ds > todayStr() ? 'future' : 'zero');
      const month = dt.getMonth();

      if (month !== currentMonth) { currentMonth = month; cells += `<div class="chain-month-label">${dt.getFullYear()}年${month+1}月</div>`; }

      let cls = 'chain-cell ' + status;
      if (status === 'future') cls = 'chain-cell zero';
      if (ds === todayStr()) cls += ' today';
      const label = status === 'full' ? '满格' : status === 'half' ? '半格' : status === 'future' ? '未来' : '未填';
      cells += `<div class="${cls}" title="${ds} · ${label}" ${ds <= todayStr() ? `onclick="App.chainDayDetail('${ds}')"` : ''}></div>`;
    }

    grid.innerHTML = cells;
    document.getElementById('chainStats').innerHTML = `
      <div class="chain-stat"><div class="cs-val">${full}</div><div class="cs-label">满格</div></div>
      <div class="chain-stat"><div class="cs-val">${half}</div><div class="cs-label">半格</div></div>
      <div class="chain-stat"><div class="cs-val">${zero}</div><div class="cs-label">空格</div></div>
      <div class="chain-stat"><div class="cs-val">${maxStreak}</div><div class="cs-label">最长连续</div></div>`;
  },

  chainDayDetail(ds) {
    const day = this.state.days[ds];
    if (!day) { this.toast('无数据'); return; }
    const blocks = (day.blocks || []).map(b => `${b.startTime} ${SUBJECT_NAMES[b.subject]} ${b.type === 'output' ? '●' : '○'}`).join(', ');
    this.toast(`${ds} · ${day.signal || '?'} · ${day.actualBlocks}块 · ${day.chainStatus} · ${blocks}`);
  },

  // ============================================================
  // RENDER: More Menu
  // ============================================================
  renderMore() {
    const items = [
      ['⭐ 主任务分类','选最多4个科目作为主分类','App.showPrimarySubjectConfig()'],
      ['📊 总结','日/周/月/年 数据回顾','App.openDrawer(\'summary\')'],
      ['🔧 自定义导航栏','拖拽排序底部按钮 (2-4项)','App.showNavConfig()'],
      ['🌙 日/夜间','手动切换或自动检测','App.toggleDayNight()'],
      ['🅿️ 停车场','杂事收集，块内快速捕捉','App.showParkingLot()'],
      ['🎯 接触区','数学渐进暴露 0-6级','App.showExposure()'],
      ['🃏 后备卡','4张无脑续命卡','App.showBackupCards()'],
      ['🆘 崩溃恢复','4个密封信封','App.showCrashRecovery()'],
      ['📋 校准四问','双周回顾','App.showCalibration()'],
      ['🚫 系统红线','14条不可违反的规则','App.showRedLines()'],
      ['📤 导出数据','JSON备份','App.exportData()'],
      ['📥 导入数据','从备份恢复','App.importData()'],
      ['📖 帮助','详细使用手册','App.showHelp()'],
      ['🔄 重置数据','清除全部本地数据','App.resetAllData()'],
      ['ℹ️ 关于','学习OS v1.0','App.showAbout()'],
    ];
    document.getElementById('moreMenu').innerHTML = items.map(([label, desc, action]) => `
      <button class="bottom-btn" onclick="${action}" style="flex-direction:row;justify-content:flex-start;gap:10px;padding:12px 14px;text-align:left;">
        <span style="flex:1;"><span style="font-weight:500;display:block;">${label}</span>
        <span style="font-size:11px;color:var(--text-muted);">${desc}</span></span>
        <span style="color:var(--text-muted);">→</span>
      </button>`).join('');
  },

  showExposure() {
    this.closeAll();
    const cards = Object.values(this.state.cards).filter(c => c.zone === 'exposure');
    const levels = [
      { l:0, label:'物理存在', eg:'坐在桌前，什么都不用做。就坐着。' },{ l:1, label:'拿出工具', eg:'把数学课本和草稿纸从书包里拿出来，放在桌上。' },
      { l:2, label:'打开浏览', eg:'翻开课本，看目录。读章节标题。不要求解答任何东西。' },{ l:3, label:'阅读观察', eg:'读一道例题及其解答。只看不写。理解它为什么这样解。' },
      { l:4, label:'抄写模仿', eg:'把例题抄一遍。一边抄一边注意每一步的变换逻辑。' },{ l:5, label:'单题实战', eg:'做一道课后习题。不限时。可以看笔记。做完即止。' },
      { l:6, label:'正常输出', eg:'做一组习题（3-5道）。计时。不看书。相当于一个正常输出型块。' },
    ];

    let html = '<h3 style="margin-bottom:12px;">接触区（渐进暴露）</h3>';
    html += '<details style="margin-bottom:14px;font-size:12px;background:var(--bg);border-radius:8px;padding:10px 12px;"><summary style="cursor:pointer;font-weight:500;color:var(--text);">📖 等级参考（以数学为例）</summary><div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">';
    for (const lv of levels) {
      const bg = lv.l === 6 ? 'var(--timer-accent)' : lv.l === 0 ? 'var(--border)' : 'var(--cream)';
      html += `<div style="display:flex;gap:8px;align-items:flex-start;"><span style="flex-shrink:0;background:${bg};color:${lv.l>=5?'#fff':'var(--text)'};padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;min-width:28px;text-align:center;">L${lv.l}</span><span><strong>${lv.label}</strong><br><span style="color:var(--text-muted);">${lv.eg}</span></span></div>`;
    }
    html += '</div></details>';

    if (cards.length === 0) {
      html += '<div class="pool-empty">接触区为空 — 为高抵触科目创建一张渐进暴露卡</div>';
    } else {
      for (const c of cards) {
        const lv = c.level ?? 0, curLevel = levels.find(ll => ll.l === lv) || levels[0];
        html += `<div class="pool-card ${c.subject}" style="margin-bottom:8px;"><div class="pcard-text">${this.escapeHtml(c.text)}</div><div class="pcard-meta">${SUBJECT_NAMES[c.subject]} · ${curLevel.label}（Lv${lv}）</div><div style="margin-top:6px;display:flex;gap:3px;flex-wrap:wrap;">`;
        for (const ll of levels) {
          const sel = lv === ll.l;
          html += `<button class="ttl-btn" style="${sel?'background:var(--timer-accent);color:#fff;font-weight:500;':''}font-size:10px;padding:3px 8px;" onclick="App.setExposureLevel('${c.id}',${ll.l})" title="${ll.label}: ${ll.eg}">L${ll.l} ${ll.label}</button>`;
        }
        html += `</div><div style="margin-top:6px;display:flex;gap:6px;"><button class="ttl-btn" onclick="App.completeExposureCard('${c.id}');App.showExposure();">完成</button><button class="ttl-btn" onclick="App.deleteCard('${c.id}');App.showExposure();" style="color:#B8443A;">删除</button></div></div>`;
      }
    }
    html += `<button class="btn btn-primary" onclick="App.closeAll();App.showCreateCard();setTimeout(()=>document.querySelector('#createZone .chip[data-zone=exposure]').click(),100);" style="width:100%;margin-top:8px;">+ 添加接触卡</button>`;
    this.showFloatPanel('接触区', html);
  },

  setExposureLevel(cardId, level) {
    this.state.cards[cardId].level = level;
    saveState(this.state);
    this.renderAll();
  },

  completeExposureCard(cardId) {
    const card = this.state.cards[cardId];
    if (!card) return;
    this.showConfirmDialog(
      '完成接触任务',
      `确认完成接触任务「${card.text}」？<br><span style="font-size:12px;color:var(--text-muted);">该卡片将被标记为已完成。</span>`,
      () => {
        card.completedAt = todayStr();
        card.zone = 'completed';
        saveState(this.state);
        this.renderAll();
        this.toast(`接触任务完成：${card.text}`);
      }
    );
  },

  showBackupCards() {
    this.closeAll();
    let html = '<h3 style="margin-bottom:12px;">后备卡（4张，块内无脑续命）</h3>';
    this.state.backupCards.forEach((b, i) => {
      html += `<div style="margin-bottom:10px;"><span style="font-size:12px;color:var(--text-muted);">后备卡 ${i+1}</span>
        <input type="text" value="${this.escapeHtml(b.text)}" id="backupText${i}" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;margin-top:4px;">
        <select id="backupSubj${i}" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;margin-top:4px;">
          ${SUBJECTS.map(s => `<option value="${s}" ${b.subject===s?'selected':''}>${SUBJECT_NAMES[s]}</option>`).join('')}
        </select></div>`;
    });
    html += '<button class="btn btn-primary" onclick="App.saveBackupCards()" style="width:100%;margin-top:8px;">保存</button>';
    this.showFloatPanel('后备卡', html);
  },

  saveBackupCards() {
    for (let i = 0; i < 4; i++) {
      this.state.backupCards[i] = {
        text: document.getElementById(`backupText${i}`)?.value || this.state.backupCards[i].text,
        subject: document.getElementById(`backupSubj${i}`)?.value || this.state.backupCards[i].subject,
      };
    }
    saveState(this.state); this.closeAll(); this.toast('后备卡已保存');
  },

  showCrashRecovery() {
    this.closeAll();
    App._crashEnvelopes = [
      ['信封 1：刷手机2小时停不下来','站起来，去洗手间用冷水洗脸。回来坐2分钟不动。不看手机。2分钟后打开信封2。'],
      ['信封 2：觉得彻底崩了，今天废了','你今天不需要学习。你只需要做一件事：把数学课本从书包里拿出来，放在桌上。这就是今天的全部要求。做完后如果不想继续，关灯睡觉。你没有输。'],
      ['信封 3：连续断了3天，觉得全完了','断3天在180天计划中占1.7%。你不是在从零开始，你是在-1天的位置。今天做一张启动卡的接触动作。链重新开始。'],
      ['信封 4：系统本身让我感到压迫','把白板上的便利贴全部取下来。今天只用一张便利贴：写一个动作，做到即可。明天只保留习惯区和信号区。其他区域后天再说。'],
    ];
    let html = '<h3 style="margin-bottom:12px;">崩溃恢复信封</h3><p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">只打开你真正需要的那一封。打开后照做。</p>';
    App._crashEnvelopes.forEach(([title], i) => {
      html += `<div class="pool-card" style="margin-bottom:8px;cursor:pointer;" onclick="App.openEnvelope(${i})"><div class="pcard-text">${title}</div><div class="pcard-meta">点击打开</div></div>`;
    });
    this.showFloatPanel('🆘 崩溃恢复', html);
  },

  openEnvelope(i) {
    const env = App._crashEnvelopes?.[i];
    if (!env) return;
    this.closeAll();
    const [title, content] = env;
    this.showFloatPanel('🆘 信封已打开', `
      <div style="text-align:center;padding:20px 0;"><div style="font-size:40px;margin-bottom:12px;">✉️</div><h3 style="margin-bottom:16px;">${this.escapeHtml(title)}</h3></div>
      <div style="padding:20px;background:var(--bg);border-radius:8px;font-size:15px;line-height:1.8;margin-bottom:16px;white-space:pre-wrap;">${this.escapeHtml(content)}</div>
      <button class="btn btn-primary" onclick="App.closeAll()" style="width:100%;">我收到了</button>`);
  },

  showCalibration() {
    this.closeAll();
    const questions = ['过去两周我累计完成了多少块？和目标的差距是多少？','差距是启动失败还是维持失败？','如果是启动失败，降级机制还活着吗？','如果是维持失败，是强度太高还是科目安排不合理？'];
    let html = '<h3 style="margin-bottom:12px;">双周校准四问</h3>';
    questions.forEach((q, i) => { html += `<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-muted);">${i+1}. ${q}</label><textarea id="calQ${i}" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;margin-top:4px;resize:vertical;font-family:inherit;font-size:13px;" rows="2"></textarea></div>`; });
    html += '<button class="btn btn-primary" onclick="App.saveCalibration()" style="width:100%;margin-top:8px;">保存</button>';
    this.showFloatPanel('双周校准', html);
  },

  saveCalibration() {
    const d = todayStr();
    if (!this.state.days[d]) this.ensureToday();
    this.state.days[d].calibration = [0,1,2,3].map(i => document.getElementById(`calQ${i}`)?.value || '');
    saveState(this.state); this.closeAll(); this.toast('校准已保存');
  },

  showRedLines() {
    this.closeAll();
    const rules = ['区域不超7个，总便利贴不超30张','启动卡必须通过10秒启动测试','便利贴上禁止出现"学习"及相关模糊动词','每日规划上限3分钟','任何一天不允许归零','系统优化只在每周固定15分钟窗口进行','新增功能必须先冷静3天+试用7天','信号每日必填——先读情绪，后选任务','冲刺块期间不离开座位，50分钟不可中断','输出型块每天≥2个','数学≥1块/天（允许接触，不允许跳科）','块数只在睡前决定，不允许当天向下调整','连续两天信号焦虑/疲惫→第三天主动降低难度','块计数器是最重要的指标'];
    this.showFloatPanel('系统红线', '<h3 style="margin-bottom:12px;">系统红线</h3><ol style="padding-left:20px;font-size:13px;line-height:2;">' + rules.map(r => `<li>${r}</li>`).join('') + '</ol>');
  },

  exportData() {
    const a = document.createElement('a'), dt = new Date();
    const ts = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}_${String(dt.getHours()).padStart(2,'0')}${String(dt.getMinutes()).padStart(2,'0')}`;
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = `学习OS备份数据-${ts}.json`; a.click();
    URL.revokeObjectURL(url); this.closeAll(); this.toast('数据已导出');
  },

  resetAllData() {
    this.closeAll();
    if (!confirm('确定要清除所有数据吗？此操作不可撤销。建议先导出备份。')) return;
    localStorage.removeItem(LS_KEY);
    this.state = defaultState();
    this.ensureToday();
    this.renderAll();
    this.toast('数据已重置');
  },

  importData() {
    this.closeAll();
    const input = document.getElementById('importFileInput');
    input.value = '';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.days || !data.cards) throw new Error('格式无效');
          this.state = data;
          saveState(this.state);
          this.renderAll();
          this.toast('数据已导入并覆盖当前数据');
        } catch (err) {
          this.toast('文件格式无效，导入失败');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  helpPage: 0,

  showHelp() {
    this.helpPage = 0;
    this.closeAll();
    this.renderHelpPage();
  },

  renderHelpPage() {
    const total = HELP_PAGES.length, p = HELP_PAGES[this.helpPage], isFirst = this.helpPage === 0, isLast = this.helpPage === total - 1;
    const old = document.getElementById('floatGeneric'); if (old) old.remove();
    const panel = document.createElement('div');
    panel.className = 'float-panel show'; panel.id = 'floatGeneric'; panel.style.maxWidth = '520px';
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="margin:0;">${p.title}</h3><button onclick="App.closeAll()" style="font-size:18px;color:var(--text-muted);cursor:pointer;">✕</button></div>
      <div style="font-size:13px;line-height:1.8;color:var(--text);max-height:55vh;overflow-y:auto;padding-right:4px;">${p.html}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--border-light);">
        <span style="font-size:11px;color:var(--text-muted);">第 ${this.helpPage+1} / ${total} 页</span>
        <div style="display:flex;gap:8px;">${!isFirst ? '<button class="btn btn-ghost" onclick="App.helpPrev()" style="padding:8px 16px;">← 上一页</button>' : ''}<button class="btn btn-primary" onclick="${isLast?'App.closeAll()':'App.helpNext()'}" style="padding:8px 20px;">${isLast?'关闭':'下一页 →'}</button></div></div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">${Array.from({length:total},(_,i)=>`<span style="width:6px;height:6px;border-radius:50%;background:${i===this.helpPage?'var(--timer-accent)':'var(--border)'};display:inline-block;"></span>`).join('')}</div>`;
    document.body.appendChild(panel);
    this.currentFloat = 'generic';
    const ov = document.getElementById('overlay'); ov.style.opacity = ''; ov.style.transition = ''; ov.classList.add('show');
  },

  helpNext() { if (this.helpPage < HELP_PAGES.length - 1) { this.helpPage++; this.renderHelpPage(); } },
  helpPrev() { if (this.helpPage > 0) { this.helpPage--; this.renderHelpPage(); } },

  showAbout() {
    this.closeAll();
    const content = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:48px;line-height:1;margin-bottom:8px;">🧠</div>
        <div style="font-size:20px;font-weight:600;">学习OS</div>
        <div style="font-size:12px;color:var(--text-muted);">v1.0 · 2026.06</div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:14px;margin-bottom:14px;">
        <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;">
          为 ADHD 考生设计的考研学习操作系统。
        </p>
        <p style="margin:0 0 8px 0;font-size:12px;color:var(--text-muted);line-height:1.5;">
          <strong>三原则</strong><br>
          管理启动摩擦（而非管理时间）<br>
          管理情绪（而非管理任务）<br>
          管理连续性（而非追求效率）
        </p>
        <p style="margin:0;font-size:12px;color:var(--text-muted);line-height:1.5;">
          <strong>核心机制</strong><br>
          信号扫描 → 启动卡 → 冲刺块（50+10）→ 后备卡 → 接触区 → 崩溃恢复信封
        </p>
      </div>
      <div style="background:#F4F8F5;border:1px solid #D4E8DB;border-radius:8px;padding:12px;margin-bottom:14px;">
        <p style="margin:0;font-size:12px;color:var(--text);line-height:1.5;">
          <strong>🔒 隐私保证</strong><br>
          所有数据存储在浏览器 localStorage，不上传任何服务器，不收集任何信息。这个文件就是你数据的唯一副本。建议定期使用「导出数据」备份。
        </p>
      </div>
      <div style="font-size:11px;color:var(--text-muted);text-align:center;line-height:1.6;">
        单文件 · 零依赖 · 纯前端<br>
        双击 index.html 即可运行<br>
        发送给任何人，对方打开即用
      </div>
    `;
    this.showFloatPanel('关于 学习OS', content);
  },

  showFloatPanel(title, content) {
    // Generic float panel
    const existing = document.getElementById('floatGeneric');
    if (existing) existing.remove();
    const panel = document.createElement('div');
    panel.className = 'float-panel show';
    panel.id = 'floatGeneric';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;">${title}</h3>
        <button onclick="App.closeAll()" style="font-size:18px;color:var(--text-muted);cursor:pointer;">✕</button>
      </div>
      ${content}
    `;
    document.body.appendChild(panel);
    this.currentFloat = 'generic';
    const ov = document.getElementById('overlay'); ov.style.opacity = ''; ov.style.transition = ''; ov.classList.add('show');
  },

  // ============================================================
  // RENDER: Bottom Bar
  // ============================================================
  renderBottomBar() {
    const items = this.state.navbarItems || ['newCard', 'pool', 'summary'];
    const defs = items.map(k => NAV_ITEMS.find(n => n.key === k)).filter(Boolean);
    let html = defs.map(d => {
      const badgeHtml = d.badge ? `<span class="badge" id="${d.badge}" style="display:none;">0</span>` : '';
      return `<button class="bottom-btn" onclick="${d.action}">
        <span class="icon">${d.icon}</span>${d.label}${badgeHtml}
      </button>`;
    }).join('');
    html += `<button class="bottom-btn" onclick="App.openDrawer('more')">
      <span class="icon">⋯</span>更多
    </button>`;
    document.getElementById('bottomBar').innerHTML = html;
    this.renderPoolBadge();
  },

  showNavConfig() {
    this.closeAll();
    const current = this.state.navbarItems || ['newCard', 'pool', 'summary'];
    const orderMap = {};
    current.forEach((k, i) => { orderMap[k] = i; });
    const ordered = [...NAV_ITEMS].sort((a, b) => {
      const ao = orderMap[a.key] ?? 99;
      const bo = orderMap[b.key] ?? 99;
      return ao - bo;
    });
    const itemsHtml = ordered.map(item => {
      const checked = current.includes(item.key);
      return `<div class="nav-config-item" draggable="true" data-key="${item.key}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border-radius:8px;cursor:grab;transition:transform 0.15s,box-shadow 0.15s;"
          ondragstart="App._navDragStart(event)" ondragover="App._navDragOver(event)" ondragleave="App._navDragLeave(event)" ondrop="App._navDrop(event)" ondragend="App._navDragEnd()">
        <span style="cursor:grab;color:var(--text-muted);font-size:14px;">⠿</span>
        <input type="checkbox" data-key="${item.key}" ${checked ? 'checked' : ''} onchange="App.onNavConfigToggle()" style="width:18px;height:18px;accent-color:var(--timer-accent);">
        <span style="font-size:16px;">${item.icon}</span>
        <span style="font-weight:500;">${item.label}</span>
      </div>`;
    }).join('');

    this.showFloatPanel('自定义导航栏', `
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">勾选 2–4 项，拖拽 ⠿ 排序。更多始终在最右侧</p>
      <div style="display:flex;flex-direction:column;gap:8px;" id="navConfigList">${itemsHtml}</div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center;" id="navConfigHint"></p>
      <button class="btn btn-primary" onclick="App.saveNavConfig()" style="width:100%;margin-top:12px;">保存</button>
    `);
    this.onNavConfigToggle();
  },

  onNavConfigToggle() {
    const checked = document.querySelectorAll('#navConfigList input[type=checkbox]:checked');
    const hint = document.getElementById('navConfigHint');
    if (checked.length < 2) {
      hint.textContent = '至少选 2 项';
      hint.style.color = '#B8443A';
    } else if (checked.length > 4) {
      hint.textContent = '最多选 4 项';
      hint.style.color = '#B8443A';
    } else {
      hint.textContent = `已选 ${checked.length} 项（共 ${checked.length + 1} 个按钮含更多）`;
      hint.style.color = 'var(--text-muted)';
    }
  },

  saveNavConfig() {
    const items = document.querySelectorAll('#navConfigList .nav-config-item');
    const checked = [];
    items.forEach(el => {
      const cb = el.querySelector('input[type=checkbox]');
      if (cb && cb.checked) checked.push(el.dataset.key);
    });
    if (checked.length < 2) { this.toast('至少选择 2 项'); return; }
    if (checked.length > 4) { this.toast('最多选择 4 项'); return; }
    this.state.navbarItems = checked;
    saveState(this.state);
    this.closeAll();
    this.renderBottomBar();
    this.toast('导航栏已更新');
  },

  _navDragStart(e) {
    const item = e.target.closest('.nav-config-item');
    if (!item) return;
    item.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.key);
    this._navDragKey = item.dataset.key;
  },

  _navDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.nav-config-item');
    if (item && item.dataset.key !== this._navDragKey) {
      item.style.transform = 'translateY(4px)';
      item.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    }
  },

  _navDragLeave(e) {
    const item = e.target.closest('.nav-config-item');
    if (item) {
      item.style.transform = '';
      item.style.boxShadow = '';
    }
  },

  _navDrop(e) {
    e.preventDefault();
    const target = e.target.closest('.nav-config-item');
    const list = document.getElementById('navConfigList');
    if (!target || !list || target.dataset.key === this._navDragKey) return;
    const src = list.querySelector(`[data-key="${this._navDragKey}"]`);
    if (src && target) {
      const items = [...list.querySelectorAll('.nav-config-item')];
      const srcIdx = items.indexOf(src);
      const tgtIdx = items.indexOf(target);
      if (srcIdx < tgtIdx) {
        list.insertBefore(src, target.nextSibling);
      } else {
        list.insertBefore(src, target);
      }
    }
    this._navDragEnd();
  },

  _navDragEnd() {
    document.querySelectorAll('#navConfigList .nav-config-item').forEach(el => {
      el.style.opacity = '';
      el.style.transform = '';
      el.style.boxShadow = '';
    });
  },

  showPrimarySubjectConfig() {
    this.closeAll();
    const primary = this.getPrimarySubjects();
    const itemsHtml = SUBJECTS.map(s => {
      const checked = primary.includes(s);
      return `<label class="nav-config-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border-radius:8px;cursor:pointer;">
        <input type="checkbox" data-key="${s}" ${checked ? 'checked' : ''} onchange="App.onPrimarySubjectToggle()" style="width:18px;height:18px;accent-color:var(--timer-accent);">
        <span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${SUBJECT_COLORS[s]};"></span>
        <span style="font-weight:500;">${SUBJECT_NAMES[s]}</span>
      </label>`;
    }).join('');

    this.showFloatPanel('主任务分类', `
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">选择最多4个主分类。今日任务量和总结明细仅统计主分类。</p>
      <div style="display:flex;flex-direction:column;gap:8px;" id="primarySubjectList">${itemsHtml}</div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center;" id="primarySubjectHint"></p>
      <button class="btn btn-primary" onclick="App.savePrimarySubjects()" style="width:100%;margin-top:12px;">保存</button>
    `);
    this.onPrimarySubjectToggle();
  },

  onPrimarySubjectToggle() {
    const checked = document.querySelectorAll('#primarySubjectList input[type=checkbox]:checked');
    const hint = document.getElementById('primarySubjectHint');
    if (checked.length === 0) {
      hint.textContent = '至少选 1 个主分类';
      hint.style.color = '#B8443A';
    } else if (checked.length > 4) {
      hint.textContent = '最多选 4 个主分类';
      hint.style.color = '#B8443A';
    } else {
      hint.textContent = `已选 ${checked.length} 个主分类`;
      hint.style.color = 'var(--text-muted)';
    }
  },

  savePrimarySubjects() {
    const checked = document.querySelectorAll('#primarySubjectList input[type=checkbox]:checked');
    if (checked.length === 0) { this.toast('至少选择 1 个主分类'); return; }
    if (checked.length > 4) { this.toast('最多选择 4 个主分类'); return; }
    this.state.primarySubjects = Array.from(checked).map(cb => cb.dataset.key);
    saveState(this.state);
    this.closeAll();
    this.renderAll();
    this.toast('主分类已更新');
  },

  // ============================================================
  // RENDER ALL
  // ============================================================
  renderAll() {
    this.renderSignal();
    this.renderModeBadges();
    this.renderChainMini();
    this.renderTodayCards();
    this.renderTimerBlockCount();
    this.renderPoolBadge();
    this.renderQuickStats();
    this.renderExposure();
    this.updateCircadianIndicator();
  },

  renderSignal() {
    const d = todayStr();
    const day = this.state.days[d];
    const currentSignal = day?.signal;
    const bar = document.getElementById('signalBar');
    bar.querySelectorAll('.signal-option').forEach(el => {
      el.className = 'signal-option';
      if (currentSignal) {
        el.classList.add('done');
        if (el.dataset.signal === currentSignal) {
          el.classList.add(SIGNAL_CSS[currentSignal] || '');
        }
      }
    });
    document.getElementById('signalHint').className = !currentSignal && new Date().getHours() >= 10 ? 'signal-hint show' : 'signal-hint';
    this.renderModeBadges();
  },

  renderModeBadges() {
    const d = todayStr();
    const day = this.state.days[d];
    const signal = day?.signal;
    const modeBadge = document.getElementById('modeBadge');
    const targetBadge = document.getElementById('targetBadge');
    if (signal) {
      const mode = MODES[signal];
      const colors = { '平静':'#E4EFE5','焦虑':'#F0E8EC','无聊':'#E8F0E9','疲惫':'#EDE8F0','兴奋':'#E6F2EC' };
      modeBadge.style.display = '';
      modeBadge.style.background = colors[signal] || '#E4EDE4';
      modeBadge.textContent = mode.name;
      targetBadge.style.display = '';
      targetBadge.textContent = `目标 ${day.actualBlocks}/${this.getTodayTarget()} 块`;
    } else {
      modeBadge.style.display = 'none';
      targetBadge.style.display = 'none';
    }
  },

  renderChainMini() {
    const startDate = new Date(this.state.startDate || todayStr());
    const endDate = new Date(2026, 11, 31);
    const totalDays = Math.max(1, Math.ceil((endDate - startDate) / 86400000) + 1);
    const todayDt = new Date(), today = todayStr();
    const showStart = Math.max(0, Math.floor((todayDt - startDate) / 86400000) - 40);

    let dots = '';
    for (let i = showStart; i < totalDays; i++) {
      const dt = new Date(startDate); dt.setDate(startDate.getDate() + i);
      const ds = fmtLocal(dt);
      const status = this.state.days[ds]?.chainStatus ?? (ds > today ? 'future' : 'zero');
      const cls = `chain-dot ${status}${ds === today ? ' today' : ''}`;
      dots += `<div class="${cls}" title="${ds}"></div>`;
      if (ds === today && i - showStart > 50) break;
    }

    document.getElementById('chainMiniDots').innerHTML = dots;
    let totalFull = 0, totalHalf = 0;
    for (const day of Object.values(this.state.days)) {
      if (day.chainStatus === 'full') totalFull++;
      else if (day.chainStatus === 'half') totalHalf++;
    }
    document.getElementById('chainMiniStat').textContent = `${totalFull}F ${totalHalf}H`;
  },

  renderTodayCards() {
    const todayCards = this.getTodayCards(), slotCount = this.getTodaySlotCount();
    const activeCardId = this.timer.activeCardId, slots = document.getElementById('todaySlots');
    const attrs = (id) => `oncontextmenu="event.preventDefault();App.showCardContextMenu('${id}',event)" data-card-id="${id}" onmousedown="App._cardMouseDown(event,'${id}')" onmouseup="App._cardMouseUp('${id}')" ontouchstart="App._cardTouchStart(event,'${id}')" ontouchend="App._cardTouchEnd(event,'${id}')" ontouchmove="App._cardTouchMove()"`;

    let html = '';
    for (let i = 0; i < slotCount; i++) {
      const card = todayCards[i];
      if (card) {
        const isActive = card.id === activeCardId && this.timer.mode === 'RUNNING';
        const isDone = card.completedAt != null;
        const cls = `card-slot${PRESET_SUBJECTS.includes(card.subject) ? ' ' + card.subject : ''}${isActive ? ' active' : ''}${isDone ? ' done' : ''}`;
        const act = isDone ? '' : `onclick="App.selectTimerCard('${card.id}')"`;
        const subjColor = SUBJECT_COLORS[card.subject] || '#aaa';
        html += `<div class="${cls}" ${act} ${attrs(card.id)} style="animation:cardSlideIn 0.45s var(--ease-out-expo) both;animation-delay:${i * 80}ms;border-left-color:${subjColor}">
          <div class="card-inner">
            <div class="card-text">${this.escapeHtml(card.text)}</div>
            <div class="card-type">${card.type === 'output' ? '● 输出' : '○ 输入'}${card.level != null ? ` · Lv${card.level}` : ''}</div>
            ${card.degraded ? '<div class="card-degrade">↓ 已降级</div>' : ''}
          </div>
        </div>`;
      } else {
        html += `<div class="card-slot empty" onclick="App.showCardPicker(${i})">+</div>`;
      }
    }
    slots.innerHTML = html;
    document.getElementById('todayCount').textContent = `${this.getPrimaryTodayCards().length}主 / ${this.getTodayTarget()}`;

    const refCardId = activeCardId || this.timer.activeCardId;
    const refCard = refCardId ? this.state.cards[refCardId] : null;
    const ref = document.getElementById('timerCardRef');
    if (refCard) {
      ref.textContent = refCard.text; ref.classList.remove('empty');
      ref.style.borderLeftColor = SUBJECT_COLORS[refCard.subject] || 'var(--timer-accent)';
    }
  },

  renderTimerBlockCount() {
    const day = this.getTodayDay();
    const mode = this.getTodayMode();
    const target = mode ? this.getTodayTarget() : 3;
    document.getElementById('timerBlockCount').textContent = `今日${day.actualBlocks}卡/${target}卡`;
  },

  renderPoolBadge() {
    const count = this.getPoolCards().length;
    const badge = document.getElementById('poolBadge');
    if (count > 0) {
      badge.style.display = ''; badge.textContent = count;
    } else {
      badge.style.display = 'none';
    }
  },

  renderQuickStats() {
    const d = todayStr(), day = this.state.days[d] || { actualBlocks: 0, targetBlocks: 3 };
    document.getElementById('qsTodayBlocks').textContent = day.actualBlocks;

    // Week blocks
    const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay() || 7) + 1);
    let weekBlocks = 0;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday); dt.setDate(monday.getDate() + i);
            weekBlocks += this.state.days[fmtLocal(dt)]?.actualBlocks || 0;
    }
    document.getElementById('qsWeekBlocks').textContent = weekBlocks;

    // Streak
    let streak = 0;
    for (let i = 0; i < 200; i++) {
      const ds = new Date(); ds.setDate(ds.getDate() - i);
            const status = this.state.days[fmtLocal(ds)]?.chainStatus;
      if (status === 'full' || status === 'half') streak++;
      else if (i === 0) continue;
      else break;
    }
    const streakEl = document.getElementById('qsStreak'), streakParent = streakEl.parentElement;
    streakEl.textContent = streak;
    streakParent.classList.remove('good', 'warn');
    if (streak >= 30) streakParent.classList.add('good');
    else if (streak < 3 && day.actualBlocks === 0) streakParent.classList.add('warn');
  },

  renderExposure() {
    const cards = Object.values(this.state.cards).filter(c => c.zone === 'exposure');
    const list = document.getElementById('exposureList'), empty = document.getElementById('exposureEmpty');
    if (!list) return;
    if (cards.length === 0) { list.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';

    const levels = [{ l:0, label:'物理存在' },{ l:1, label:'拿出工具' },{ l:2, label:'打开浏览' },{ l:3, label:'阅读观察' },{ l:4, label:'抄写模仿' },{ l:5, label:'单题实战' },{ l:6, label:'正常输出' }];
    const subjCol = { math:'#5B9E8A', biochem:'#4A8C9E', english:'#5E9E4E', politics:'#8B7EB8' };

    list.innerHTML = cards.map(c => {
      const lv = c.level ?? 0, color = subjCol[c.subject] || 'var(--border)';
      const dots = levels.map((ll, i) => `<span class="exp-lvl-dot ${i <= lv ? 'on' : 'off'}"></span>`).join('');
      const onclick = `onclick="App.showExposureLevelPicker('${c.id}')"`;
      return `<div class="exposure-item" style="border-left:3px solid ${color};">
        <span class="exp-dot" style="background:${subjCol[c.subject] || 'var(--text-muted)'};" ${onclick}></span>
        <span class="exp-text" title="${this.escapeHtml(c.text)}" ${onclick}>${this.escapeHtml(c.text)}</span>
        <span class="exp-level-row" ${onclick}>${dots}</span>
        <span class="exp-lvl-label" ${onclick}>Lv${lv} ${levels.find(ll => ll.l === lv)?.label || ''}</span>
        <button class="exp-done-btn" onclick="event.stopPropagation();App.completeExposureCard('${c.id}')" title="完成">✓</button>
        <button class="exp-delete-btn" onclick="event.stopPropagation();App.deleteCard('${c.id}')" title="删除">✕</button>
      </div>`;
    }).join('');
  },

  showExposureLevelPicker(cardId) {
    const c = this.state.cards[cardId];
    if (!c) return;
    const levels = [
      { l:0, label:'物理存在', eg:'坐在桌前，什么都不用做' },
      { l:1, label:'拿出工具', eg:'课本和草稿纸放桌上' },
      { l:2, label:'打开浏览', eg:'翻看目录和章节标题' },
      { l:3, label:'阅读观察', eg:'读例题及解答，只看不写' },
      { l:4, label:'抄写模仿', eg:'抄例题，注意变换逻辑' },
      { l:5, label:'单题实战', eg:'做一道课后题，不限时' },
      { l:6, label:'正常输出', eg:'做一组题，计时不看书' },
    ];
    const curLv = c.level ?? 0;
    let html = `<h3 style="margin-bottom:8px;">${this.escapeHtml(c.text)}</h3>`;
    html += `<p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">${SUBJECT_NAMES[c.subject]} · 接触区 · 当前 Lv${curLv}</p>`;
    levels.forEach(ll => {
      const sel = curLv === ll.l;
      html += `
        <div class="exposure-item" onclick="App.setExposureLevel('${cardId}',${ll.l});App.closeAll();" style="${sel ? 'background:var(--accent-light);border-color:var(--timer-accent);box-shadow:var(--shadow-sm);' : ''}margin-bottom:4px;border-left:${sel ? '3px solid var(--timer-accent)' : '3px solid transparent'};">
          <span style="flex-shrink:0;font-weight:600;font-size:11px;color:${sel ? 'var(--timer-accent)' : 'var(--text-muted)'};width:24px;">L${ll.l}</span>
          <span style="flex:1;font-size:13px;font-weight:${sel ? '600' : '400'};">${ll.label}</span>
          <span style="font-size:10px;color:var(--text-muted);">${ll.eg}</span>
        </div>
      `;
    });
    html += `<div style="margin-top:8px;display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="App.moveCardToToday('${cardId}');App.closeAll();" style="flex:1;">→ 今日区</button>
      <button class="btn btn-ghost" onclick="App.state.cards['${cardId}'].zone='pool';saveState(App.state);App.closeAll();App.renderAll();" style="flex:1;">→ 任务池</button>
    </div>`;
    this.showFloatPanel('调整接触等级', html);
  },

  // ============================================================
  // UTILS
  // ============================================================
  daysAgo(dateStr) {
    if (!dateStr) return '?';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
    return diff;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  toast(msg) {
    const container = document.getElementById('toastContainer');
    container.querySelectorAll('.toast').forEach((t, i) => {
      t.style.opacity = String(Math.max(0.3, 0.9 - i * 0.2));
      t.style.transform = `translateY(${i * -8}px)`;
      t.style.transition = 'all 0.3s var(--ease-out-expo)';
    });
    // Auto-prefix icon based on message tone
    let icon = '';
    if (!/[✓↓↑⬇⬆✗⚡]/.test(msg)) {
      if (/完成|创建|保存|成功|导入/.test(msg)) icon = '✓ ';
      else if (/满|锁定|请先/.test(msg)) icon = '⚡ ';
      else if (/删除|移除|失败|无效/.test(msg)) icon = '✗ ';
      else if (/重置|覆盖/.test(msg)) icon = '↺ ';
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = icon + msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 1, 1)';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(() => el.remove(), 310);
    }, 2800);
  },

  checkSignalReminder() {
    // Already handled in renderSignal
    this.renderSignal();
  },

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================
  onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (this._immersiveActive()) break; // space does nothing in immersive
        if (this.timer.mode === 'IDLE' || this.timer.mode === 'PAUSED') this.timerMainAction();
        else if (this.timer.mode === 'RUNNING') this.timerPause();
        break;
      case 'Escape':
        if (this._immersiveActive()) {
          this.exitImmersive();
        } else {
          this.closeAll();
          if (this.timer.mode === 'RUNNING') this.timerPause();
        }
        break;
      case '1': case '2': case '3':
        const idx = parseInt(e.key) - 1;
        const todayCards = this.getTodayCards();
        if (todayCards[idx] && this.timer.mode === 'IDLE') {
          this.timer.activeCardId = todayCards[idx].id;
          this.timerStart();
        } else if (!todayCards[idx]) {
          this.showCardPicker(idx);
        }
        break;
      case 'n':
        this.showCreateCard();
        break;
      case 't':
        this.openDrawer('pool');
        break;
      case 's':
        this.openDrawer('summary');
        break;
      case 'ArrowLeft':
        if (this.currentDrawer === 'summary') {
          const tabs = ['daily','weekly','monthly','yearly'];
          const idx2 = tabs.indexOf(this.summaryTab);
          if (idx2 > 0) this.renderSummary(tabs[idx2 - 1]);
        }
        break;
      case 'ArrowRight':
        if (this.currentDrawer === 'summary') {
          const tabs = ['daily','weekly','monthly','yearly'];
          const idx2 = tabs.indexOf(this.summaryTab);
          if (idx2 < tabs.length - 1) this.renderSummary(tabs[idx2 + 1]);
        }
        break;
    }
  },

  // ============================================================
  // LANDING PAGE
  // ============================================================
  initLandingPage() {
    const landing = document.getElementById('landingPage'), inner = document.getElementById('landingInner');
    landing.style.display = '';
    const isMobile = this._isMobile();

    if (isMobile) {
      inner.classList.add('visible');
      this.animatePentagonFlyIn(landing);
    } else {
      const linesContainer = document.createElement('div');
      linesContainer.className = 'geo-container';
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 8; i++) {
        const line = document.createElement('div');
        line.className = 'geo-block';
        line.style.cssText = `width:${30+Math.random()*50}px;height:1px;background:#1A1A1A;opacity:0.06;left:${10+Math.random()*80}%;top:${10+Math.random()*80}%;transform:rotate(${Math.random()*360}deg);animation-delay:${i*0.12}s;`;
        frag.appendChild(line);
      }
      linesContainer.appendChild(frag);
      landing.appendChild(linesContainer);
      requestAnimationFrame(() => linesContainer.querySelectorAll('.geo-block').forEach(b => b.classList.add('animate-in')));
      setTimeout(() => {
        linesContainer.querySelectorAll('.geo-block').forEach(b => { b.classList.remove('animate-in'); b.classList.add('animate-out'); });
        setTimeout(() => { linesContainer.remove(); inner.classList.add('visible'); this.animatePentagonFlyIn(landing); }, 350);
      }, 1000);
    }

    Onboard.showIfNotDismissed();
    const tutorialLink = document.createElement('div');
    tutorialLink.className = 'landing-tutorial-link'; tutorialLink.textContent = '点击查看新手教程 →';
    tutorialLink.onclick = (e) => { e.stopPropagation(); Onboard.show(); };
    landing.appendChild(tutorialLink);

    landing.querySelectorAll('.landing-mood-btn').forEach(btn => {
      btn.onclick = () => {
        const signal = btn.dataset.signal;
        landing.querySelectorAll('.landing-mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.triggerInkTransition(btn, () => this.showLandingConfirm(signal));
      };
    });
  },

  animatePentagonFlyIn(landing) {
    const buttons = landing.querySelectorAll('.landing-mood-btn');
    buttons.forEach((btn, i) => {
      setTimeout(() => {
        btn.classList.add('placed');
      }, i * 120);
    });
  },

  triggerInkTransition(btn, callback) {
    const rect = btn.querySelector('.mood-geo').getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, size = Math.max(rect.width, rect.height);

    const drop = document.createElement('div');
    drop.className = 'ink-drop';
    drop.style.cssText = `width:${size}px;height:${size}px;left:${cx-size/2}px;top:${cy-size/2}px;`;
    document.body.appendChild(drop);

    for (let i = 0; i < 6; i++) {
      const burst = document.createElement('div'), bs = 8 + Math.random() * 16;
      burst.className = 'geo-burst-ink';
      burst.style.cssText = `width:${bs}px;height:${bs}px;left:${cx}px;top:${cy}px;animation-delay:${i*0.06}s;`;
      document.body.appendChild(burst);
      setTimeout(() => burst.remove(), 900);
    }

    document.documentElement.style.setProperty('--ink-x', (cx/window.innerWidth*100) + '%');
    document.documentElement.style.setProperty('--ink-y', (cy/window.innerHeight*100) + '%');

    const reveal = document.createElement('div');
    reveal.className = 'theme-reveal-overlay';
    document.body.appendChild(reveal);
    requestAnimationFrame(() => { reveal.classList.add('reveal'); drop.classList.add('spread'); });

    setTimeout(() => { drop.remove(); reveal.remove(); callback?.(); }, 500);
  },

  showLandingConfirm(signal) {
    const mode = MODES[signal], geoSymbols = { '平静':'—', '焦虑':'~', '无聊':'◇', '疲惫':'°', '兴奋':'↑' };
    const panel = document.createElement('div');
    panel.className = 'float-panel show'; panel.id = 'floatSignalConfirm'; panel.style.zIndex = '600';
    panel.innerHTML = `<div style="text-align:center;">
      <div style="font-size:36px;line-height:1;margin-bottom:8px;color:#1A1A1A;font-family:Georgia,serif;">${geoSymbols[signal]}</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:4px;">${mode.name}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">${mode.desc}</div>
      <p style="font-size:14px;color:var(--text);margin-bottom:12px;">今日可容纳 <b>${mode.cards}</b> 张任务卡，确定吗？</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="btn btn-ghost" onclick="App.closeLandingConfirm()" style="min-width:80px;">否</button>
        <button class="btn btn-primary" id="confirmSignalBtn" style="min-width:80px;">是</button>
      </div></div>`;
    document.body.appendChild(panel);
    document.getElementById('confirmSignalBtn').onclick = () => { this._fromLanding = true; this.confirmSignal(signal); };
    const overlay = document.getElementById('overlay');
    overlay.style.opacity = ''; overlay.style.transition = ''; overlay.classList.add('show'); overlay.style.zIndex = '599';
  },

  closeLandingConfirm() {
    const panel = document.getElementById('floatSignalConfirm');
    if (panel) panel.remove();
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('overlay').style.zIndex = '';
  },

  transitionToMain() {
    const landing = document.getElementById('landingPage'), inner = document.getElementById('landingInner'), app = document.getElementById('app');
    inner.classList.remove('visible');
    inner.style.cssText = 'opacity:0;transform:scale(0.95);transition:opacity 0.4s var(--ease-out-expo),transform 0.4s var(--ease-out-expo);';

    for (let i = 0; i < 10; i++) {
      const burst = document.createElement('div'), size = 8 + Math.random() * 20, angle = (i/10)*Math.PI*2, dist = 50 + Math.random()*100;
      burst.className = 'geo-burst-ink';
      burst.style.cssText = `width:${size}px;height:${size}px;left:50%;top:50%;animation-delay:${i*0.05}s;`;
      landing.appendChild(burst);
      requestAnimationFrame(() => { burst.style.transform = `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px) scale(2) rotate(30deg)`; burst.style.opacity = '0'; burst.style.transition = 'all 0.8s var(--ease-out-expo)'; });
    }

    setTimeout(() => {
      landing.classList.add('fade-out'); app.style.display = ''; app.classList.add('landing-reveal', 'reveal-sections');
      setTimeout(() => { landing.style.display = 'none'; landing.querySelectorAll('.geo-burst-ink').forEach(b => b.remove()); document.querySelectorAll('.ink-drop, .theme-reveal-overlay').forEach(el => el.remove()); }, 500);
    }, 350);
  },

  // ============================================================
  // THEME MANAGEMENT
  // ============================================================
  applyTheme(signal) {
    document.body.dataset.theme = this._nightOverride === true ? 'night' : (signal || '');
    // Update PWA theme color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      meta.content = bg || '#F2F6F2';
    }
  },

  checkNightMode() {
    // If user manually overrode today, respect it
    const override = localStorage.getItem('studyos-night-override');
    const today = todayStr();
    if (override) {
      try {
        const ov = JSON.parse(override);
        if (ov.date === today) {
          this._nightOverride = ov.value;
        } else {
          localStorage.removeItem('studyos-night-override');
          this._nightOverride = null;
        }
      } catch (e) {
        this._nightOverride = null;
      }
    }

    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 6;
    const shouldBeNight = this._nightOverride != null ? this._nightOverride : isNight;
    const currentIsNight = document.body.dataset.theme === 'night';

    // Only transition if state actually changed
    if (shouldBeNight !== currentIsNight) {
      if (shouldBeNight) {
        document.body.dataset.theme = 'night';
      } else {
        const d = todayStr();
        const signal = this.state.days[d]?.signal;
        this.applyTheme(signal || '');
      }
    }

    this.updateCircadianIndicator();
  },

  updateCircadianIndicator() {
    const dot = document.getElementById('circadianDot');
    const label = document.getElementById('circadianLabel');
    if (!dot || !label) return;
    const isNight = document.body.dataset.theme === 'night';
    dot.style.background = isNight ? '#888' : '';
    const override = this._nightOverride;
    if (override === true) label.textContent = '夜间';
    else if (override === false) label.textContent = '日间';
    else label.textContent = '自动';
  },

  toggleDayNight() {
    const isNight = document.body.dataset.theme === 'night';
    const today = todayStr();
    this._nightOverride = !isNight;
    localStorage.setItem('studyos-night-override', JSON.stringify({ date: today, value: !isNight }));

    // Animate the transition
    this.animateDayNightTransition(!isNight);

    if (!isNight) {
      // Switching to night
      this.applyTheme('night');
      document.body.dataset.theme = 'night';
    } else {
      // Switching to day
      const d = todayStr();
      const signal = this.state.days[d]?.signal;
      this.applyTheme(signal || '');
    }
  },

  animateDayNightTransition(toNight) {
    const overlay = document.createElement('div');
    overlay.className = 'daynight-overlay';
    document.body.appendChild(overlay);

    // Orb that travels from old state to new state
    const orb = document.createElement('div');
    orb.className = 'daynight-orb ' + (toNight ? 'sun' : 'moon');
    document.body.appendChild(orb);

    requestAnimationFrame(() => {
      overlay.classList.add(toNight ? 'to-night' : 'to-day');
      if (toNight) {
        orb.classList.remove('sun'); orb.classList.add('moon');
      } else {
        orb.classList.remove('moon'); orb.classList.add('sun');
      }
    });

    setTimeout(() => {
      overlay.remove();
      orb.remove();
      this.updateCircadianIndicator();
    }, 1100);
  },

  // ============================================================
  // FLOATING MINI WINDOW
  // ============================================================
  initMiniWindow() {
    const el = document.getElementById('miniWindow');
    const sphere = document.getElementById('miniSphere');
    this._miniWindow = el;
    this._miniDragging = false;
    this._miniDragX = 0; this._miniDragY = 0;
    this._miniStartX = 0; this._miniStartY = 0;
    this._miniSnapTimer = null;
    this._miniExpanded = false;

    const onStart = (e) => {
      if (el.classList.contains('expanded')) return;
      const touch = e.touches ? e.touches[0] : e;
      this._miniDragging = true;
      this._miniDragX = touch.clientX;
      this._miniDragY = touch.clientY;
      const rect = el.getBoundingClientRect();
      this._miniStartX = rect.left;
      this._miniStartY = rect.top;
      el.classList.remove('snapped');
      this._resetMiniSnap();
    };

    const onMove = (e) => {
      if (!this._miniDragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - this._miniDragX;
      const dy = touch.clientY - this._miniDragY;
      const rw = el.offsetWidth || 60, rh = el.offsetHeight || 60;
      const nx = Math.max(0, Math.min(window.innerWidth - rw, this._miniStartX + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - rh, this._miniStartY + dy));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    };

    const onEnd = () => {
      if (!this._miniDragging) return;
      this._miniDragging = false;
      this._startMiniSnapTimer();
    };

    sphere.addEventListener('mousedown', onStart);
    sphere.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);

    // Click to toggle expand/collapse (only if not dragged)
    let clickMoved = false;
    sphere.addEventListener('mousedown', () => { clickMoved = false; });
    sphere.addEventListener('mousemove', () => { clickMoved = true; });
    sphere.addEventListener('mouseup', () => {
      if (!clickMoved) this.toggleMiniExpand();
    });
    sphere.addEventListener('touchstart', () => { clickMoved = false; });
    sphere.addEventListener('touchmove', () => { clickMoved = true; });
    sphere.addEventListener('touchend', () => {
      if (!clickMoved) this.toggleMiniExpand();
    });

    // Initial position: bottom-right
    el.style.right = '16px'; el.style.bottom = '100px';
  },

  showMiniWindow() {
    const el = this._miniWindow;
    if (!el) return;
    el.classList.remove('snapped');
    if (!el.style.left) { el.style.right = '16px'; el.style.bottom = '100px'; }
    el.classList.add('show');
    this._startMiniSnapTimer();
    if (this.timer.mode === 'RUNNING') {
      const card = this.state.cards[this.timer.activeCardId];
      document.getElementById('miniExpTask').textContent = card ? card.text : '';
    }
  },

  hideMiniWindow() {
    const el = this._miniWindow;
    if (!el) return;
    el.classList.remove('show', 'expanded', 'snapped');
    this._miniExpanded = false;
    this._resetMiniSnap();
  },

  returnFromMini() {
    this.hideMiniWindow();
    window.focus();
  },

  toggleMiniExpand() {
    const el = this._miniWindow;
    if (!el) return;
    this._miniExpanded = !this._miniExpanded;
    if (this._miniExpanded) {
      el.classList.add('expanded');
      el.classList.remove('snapped');
      this._resetMiniSnap();
      // Reposition so expanded panel stays visible
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth) el.style.left = (window.innerWidth - 196) + 'px';
      if (rect.bottom > window.innerHeight) el.style.top = (window.innerHeight - 140) + 'px';
    } else {
      el.classList.remove('expanded');
      this._startMiniSnapTimer();
    }
  },

  updateMiniTime(mins, secs, pct) {
    const el = this._miniWindow;
    if (!el || !el.classList.contains('show')) return;
    const t = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('miniTime').textContent = t;
    document.getElementById('miniExpTime').textContent = t;
    const circ = 163.36;
    document.getElementById('miniProgress').style.strokeDashoffset = circ * (1 - pct);
  },

  _startMiniSnapTimer() {
    this._resetMiniSnap();
    this._miniSnapTimer = setTimeout(() => this._snapMiniToEdge(), 5000);
  },

  _resetMiniSnap() {
    if (this._miniSnapTimer) { clearTimeout(this._miniSnapTimer); this._miniSnapTimer = null; }
  },

  _snapMiniToEdge() {
    const el = this._miniWindow;
    if (!el || el.classList.contains('expanded') || this._miniDragging) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const toLeft = cx < window.innerWidth / 2;
    el.classList.add('snapped');
    el.style.right = 'auto'; el.style.bottom = 'auto';
    if (toLeft) {
      el.style.left = '-42px';
      el.style.top = Math.max(60, Math.min(rect.top, window.innerHeight - 120)) + 'px';
    } else {
      el.style.left = (window.innerWidth - 14) + 'px';
      el.style.top = Math.max(60, Math.min(rect.top, window.innerHeight - 120)) + 'px';
    }
    this._resetMiniSnap();
  },
};

// ============================================================
// ONBOARDING
// ============================================================
const ONBOARDING_STEPS = [
  {
    title: '每天开始前，花 10 秒扫描身体',
    desc: '从平静/焦虑/无聊/疲惫/兴奋中选一个词。每种心情对应固定任务卡数——平静3张、焦虑2张、无聊4张、疲惫1张、兴奋5张。选完锁定，当天不能改。',
    svg: `<svg viewBox="0 0 200 140"><rect x="10" y="30" width="180" height="36" rx="8" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5"/><rect x="20" y="37" width="38" height="22" rx="6" fill="var(--signal-calm)" stroke="#B3B7AA" stroke-width="1.5"/><rect x="62" y="37" width="38" height="22" rx="6" fill="none" stroke="var(--border)" stroke-width="1"/><rect x="104" y="37" width="38" height="22" rx="6" fill="none" stroke="var(--border)" stroke-width="1"/><rect x="146" y="37" width="38" height="22" rx="6" fill="none" stroke="var(--border)" stroke-width="1"/><text x="39" y="52" text-anchor="middle" font-size="10" fill="#8B8580" font-family="sans-serif">平静</text><text x="81" y="52" text-anchor="middle" font-size="10" fill="#8B8580" font-family="sans-serif">焦虑</text><text x="123" y="52" text-anchor="middle" font-size="10" fill="#8B8580" font-family="sans-serif">无聊</text><text x="165" y="52" text-anchor="middle" font-size="10" fill="#8B8580" font-family="sans-serif">疲惫</text><circle cx="39" cy="20" r="14" fill="none" stroke="var(--timer-accent)" stroke-width="2" stroke-dasharray="4 3"/><line x1="39" y1="35" x2="39" y2="6" stroke="var(--timer-accent)" stroke-width="1.5"/><text x="85" y="95" font-size="11" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">信号 → 任务选择策略</text><text x="85" y="115" font-size="10" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">焦虑→低威胁 · 疲惫→最小模式</text></svg>`
  },
  {
    title: '你的今天，只装信号决定的张数',
    desc: '从任务池中选启动卡放进今日区。心情决定卡数——平静3张、焦虑2张、无聊4张、疲惫1张、兴奋5张。每张卡只写一行——一个你能在 10 秒内开始的物理动作。点击空槽从任务池选卡，或点底部"新卡"创建。',
    svg: `<svg viewBox="0 0 200 140"><rect x="10" y="25" width="85" height="55" rx="8" fill="var(--math-bg)" stroke="var(--math)" stroke-width="2"/><line x1="10" y1="25" x2="14" y2="25" stroke="var(--math)" stroke-width="4" stroke-linecap="round"/><text x="52" y="50" text-anchor="middle" font-size="9" fill="#3D3835" font-family="sans-serif">做课本87页</text><text x="52" y="64" text-anchor="middle" font-size="8" fill="var(--text-muted)" font-family="sans-serif">第3题</text><rect x="105" y="25" width="85" height="55" rx="8" fill="var(--biochem-bg)" stroke="var(--biochem)" stroke-width="2"/><line x1="105" y1="25" x2="109" y2="25" stroke="var(--biochem)" stroke-width="4" stroke-linecap="round"/><text x="147" y="50" text-anchor="middle" font-size="9" fill="#3D3835" font-family="sans-serif">闭卷画糖酵解</text><text x="147" y="64" text-anchor="middle" font-size="8" fill="var(--text-muted)" font-family="sans-serif">全部步骤</text><rect x="60" y="88" width="80" height="40" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="100" y="112" text-anchor="middle" font-size="16" fill="var(--text-muted)" font-family="sans-serif">+</text><text x="100" y="18" font-size="10" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">心情决定张数 · 每张一行</text></svg>`
  },
  {
    title: '好的卡让你的手知道该干什么',
    desc: '启动卡禁止使用"学习、复习、掌握、理解、弄懂、过一遍"这些词。只需要具体的物理动作：打开、翻到、写下、朗读、背诵、做第 X 题。创建新卡时，系统会自动检测模糊动词。',
    svg: `<svg viewBox="0 0 200 140"><rect x="8" y="15" width="88" height="50" rx="6" fill="var(--surface)" stroke="#B8443A" stroke-width="1.5"/><text x="52" y="37" text-anchor="middle" font-size="10" fill="#3D3835" font-family="sans-serif">复习线代第三章</text><text x="52" y="52" text-anchor="middle" font-size="9" fill="#B8443A" font-family="sans-serif">✕ 模糊动词</text><rect x="104" y="15" width="88" height="50" rx="6" fill="var(--surface)" stroke="var(--accent-sage)" stroke-width="1.5"/><text x="148" y="37" text-anchor="middle" font-size="10" fill="#3D3835" font-family="sans-serif">做课本87页</text><text x="148" y="52" text-anchor="middle" font-size="9" fill="var(--accent-sage)" font-family="sans-serif">✓ 可10秒启动</text><text x="100" y="90" font-size="10" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">禁止：学习 · 复习 · 掌握 · 理解 · 弄懂</text><text x="100" y="108" font-size="10" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">允许：打开 · 翻到 · 写下 · 背诵 · 闭卷画</text><text x="100" y="130" font-size="9" fill="var(--timer-accent)" font-family="sans-serif" text-anchor="middle">15字以内 · 只写一行</text></svg>`
  },
  {
    title: '一次只做一件事，连续一个块',
    desc: '点击今日区的一张卡，再点"开始"——计时器开始倒计时（默认 50 分钟，可在设置中调整）。计时期间不切换科目、不碰手机、不离开座位。时间到 → 自动提醒 → 进入 10 分钟硬休息。块是唯一的 KPI。',
    svg: `<svg viewBox="0 0 200 140"><circle cx="60" cy="55" r="40" fill="none" stroke="var(--border)" stroke-width="4"/><circle cx="60" cy="55" r="40" fill="none" stroke="var(--timer-accent)" stroke-width="4" stroke-dasharray="251" stroke-dashoffset="100" stroke-linecap="round" transform="rotate(-90 60 55)"/><text x="60" y="52" text-anchor="middle" font-size="22" fill="#3D3835" font-family="sans-serif" font-weight="500">30:00</text><text x="60" y="68" text-anchor="middle" font-size="9" fill="var(--text-muted)" font-family="sans-serif">块 2 / 4</text><rect x="115" y="25" width="14" height="28" rx="3" fill="var(--math-bg)" stroke="var(--math)" stroke-width="1.5"/><rect x="132" y="45" width="14" height="28" rx="3" fill="var(--timer-accent)" opacity="0.2" stroke="var(--timer-accent)" stroke-width="1.5"/><rect x="115" y="65" width="14" height="28" rx="3" fill="none" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 2"/><text x="155" y="45" font-size="9" fill="var(--text-muted)" font-family="sans-serif">不离开</text><text x="155" y="62" font-size="9" fill="var(--text-muted)" font-family="sans-serif">不换科</text><text x="155" y="79" font-size="9" fill="var(--text-muted)" font-family="sans-serif">不碰手机</text><text x="100" y="122" font-size="9" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">默认50分钟 · 铃响自动休息10分钟</text></svg>`
  },
  {
    title: '每个块只有三种结局',
    desc: '① 时间到任务未完 → 停手，休息，下一块决定。② 任务提前完成 → 拿后备卡无脑续命。③ 卡太小 → 画 ↑ 标记下次写大。休息绝不可跳过——连续不休息 = 下午崩盘。',
    svg: `<svg viewBox="0 0 200 140"><rect x="4" y="25" width="60" height="70" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><text x="34" y="32" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-family="sans-serif">块结束·未完</text><rect x="14" y="42" width="40" height="18" rx="3" fill="var(--surface)" stroke="var(--timer-accent)" stroke-width="1"/><text x="34" y="54" text-anchor="middle" font-size="7" fill="#3D3835" font-family="sans-serif">→ 休息</text><rect x="70" y="25" width="60" height="70" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><text x="100" y="32" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-family="sans-serif">提前完成</text><text x="100" y="50" text-anchor="middle" font-size="7" fill="#3D3835" font-family="sans-serif">→ 后备卡</text><text x="100" y="64" text-anchor="middle" font-size="7" fill="#3D3835" font-family="sans-serif">1→2→3</text><rect x="136" y="25" width="60" height="70" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><text x="166" y="32" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-family="sans-serif">卡太小</text><text x="166" y="50" text-anchor="middle" font-size="11" fill="var(--timer-accent)" font-family="sans-serif">↑</text><text x="166" y="64" text-anchor="middle" font-size="7" fill="#3D3835" font-family="sans-serif">下次写大</text><text x="100" y="112" font-size="10" fill="#B8443A" font-family="sans-serif" text-anchor="middle">休息绝不可跳过</text></svg>`
  },
  {
    title: '任务池存弹药，接触区消解恐惧',
    desc: '任务池最多 20 张卡。超过 14 天不动的卡会提醒你处理。接触区是给高抵触科目的心理缓冲：从 0级（坐在桌前）到 6级（做一组题），允许从最低开始，允许在最低停止。',
    svg: `<svg viewBox="0 0 200 140"><rect x="8" y="10" width="70" height="55" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><rect x="14" y="16" width="58" height="10" rx="2" fill="var(--math-bg)"/><rect x="14" y="29" width="58" height="10" rx="2" fill="var(--biochem-bg)"/><rect x="14" y="42" width="58" height="10" rx="2" fill="var(--english-bg)"/><text x="43" y="78" font-size="8" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">任务池 ≤ 20</text><line x1="90" y1="20" x2="110" y2="20" stroke="var(--timer-accent)" stroke-width="1.5" marker-end="url(#arrow)"/><rect x="120" y="10" width="75" height="90" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><rect x="128" y="18" width="59" height="8" rx="2" fill="var(--timer-accent)" opacity="0.15"/><text x="157" y="25" text-anchor="middle" font-size="6" fill="var(--text-muted)" font-family="sans-serif">6级 做一组</text><rect x="128" y="30" width="59" height="8" rx="2" fill="var(--timer-accent)" opacity="0.12"/><rect x="128" y="42" width="59" height="8" rx="2" fill="var(--timer-accent)" opacity="0.10"/><rect x="128" y="54" width="59" height="8" rx="2" fill="var(--timer-accent)" opacity="0.08"/><rect x="128" y="66" width="59" height="8" rx="2" fill="var(--timer-accent)" opacity="0.06"/><rect x="128" y="78" width="59" height="8" rx="2" fill="var(--timer-accent)" opacity="0.04"/><text x="157" y="85" text-anchor="middle" font-size="6" fill="var(--text-muted)" font-family="sans-serif">0级 坐到桌前</text><text x="157" y="113" font-size="8" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">接触区 0→6</text></svg>`
  },
  {
    title: '你只管每天填格子，数字自己长出来',
    desc: '点底部"总结"查看你的数据。日总结告诉你今天做了什么，周总结看科目分布，月总结看趋势，年总结估计考前总学时。点击标签切换时间维度。不需要手动记录任何东西。',
    svg: `<svg viewBox="0 0 200 140"><rect x="8" y="8" width="58" height="50" rx="5" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><text x="37" y="22" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-family="sans-serif">日</text><rect x="14" y="28" width="46" height="12" rx="2" fill="var(--timer-accent)" opacity="0.2"/><rect x="14" y="42" width="46" height="8" rx="2" fill="var(--math-bg)"/><rect x="72" y="8" width="58" height="50" rx="5" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><text x="101" y="22" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-family="sans-serif">周</text><rect x="78" y="28" width="9" height="20" rx="1" fill="var(--math)"/><rect x="89" y="35" width="9" height="13" rx="1" fill="var(--biochem)"/><rect x="100" y="30" width="9" height="18" rx="1" fill="var(--english)"/><rect x="111" y="38" width="9" height="10" rx="1" fill="var(--politics)"/><rect x="136" y="8" width="56" height="50" rx="5" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/><text x="164" y="22" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-family="sans-serif">月</text><polyline points="145,48 157,38 169,45 181,35" fill="none" stroke="var(--timer-accent)" stroke-width="1.5"/><text x="100" y="78" font-size="9" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">日/周/月/年 四种视图 · ← → 切换</text><text x="100" y="98" font-size="9" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">块数是唯一KPI · 不统计时长页数</text><text x="100" y="125" font-size="10" fill="var(--timer-accent)" font-family="sans-serif" text-anchor="middle">考前预测：维持当前速率≈XXX 总学时</text></svg>`
  },
  {
    title: '五种心情，五种任务量',
    desc: '平静3张、焦虑2张、无聊4张、疲惫1张、兴奋5张。身体信号直接决定今天能扛多少——不需要手动预设。如果你某天崩溃了——刷手机停不下来、觉得全完了——打开"更多→崩溃恢复"，找对应信封，打开照做。崩溃时不要自己想办法。',
    svg: `<svg viewBox="0 0 200 140"><rect x="8" y="25" width="32" height="40" rx="6" fill="var(--signal-calm)" stroke="#B3B7AA" stroke-width="1"/><text x="24" y="50" text-anchor="middle" font-size="9" fill="#8B8580" font-family="sans-serif">平静</text><text x="24" y="78" text-anchor="middle" font-size="10" fill="var(--timer-accent)" font-family="sans-serif">3张</text><rect x="48" y="25" width="32" height="40" rx="6" fill="var(--signal-anxious)" stroke="#C9B99A" stroke-width="1"/><text x="64" y="50" text-anchor="middle" font-size="9" fill="#8B8580" font-family="sans-serif">焦虑</text><text x="64" y="78" text-anchor="middle" font-size="10" fill="var(--timer-accent)" font-family="sans-serif">2张</text><rect x="88" y="25" width="32" height="40" rx="6" fill="var(--signal-bored)" stroke="#B3B3A0" stroke-width="1"/><text x="104" y="50" text-anchor="middle" font-size="9" fill="#8B8580" font-family="sans-serif">无聊</text><text x="104" y="78" text-anchor="middle" font-size="10" fill="var(--timer-accent)" font-family="sans-serif">4张</text><rect x="128" y="25" width="32" height="40" rx="6" fill="var(--signal-tired)" stroke="#C4BDB8" stroke-width="1"/><text x="144" y="50" text-anchor="middle" font-size="9" fill="#8B8580" font-family="sans-serif">疲惫</text><text x="144" y="78" text-anchor="middle" font-size="10" fill="var(--timer-accent)" font-family="sans-serif">1张</text><rect x="168" y="25" width="32" height="40" rx="6" fill="var(--signal-excited)" stroke="#C4A882" stroke-width="1"/><text x="184" y="50" text-anchor="middle" font-size="9" fill="#8B8580" font-family="sans-serif">兴奋</text><text x="184" y="78" text-anchor="middle" font-size="10" fill="var(--timer-accent)" font-family="sans-serif">5张</text><text x="100" y="110" font-size="9" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">心情 → 任务量 · 无需手动预设</text><text x="100" y="128" font-size="9" fill="var(--text-muted)" font-family="sans-serif" text-anchor="middle">崩溃信封 → 用冷静时的你替代崩溃时的你</text></svg>`
  }
];

const HELP_PAGES = [
  {
    title: '什么是学习OS',
    html: `
      <p>学习OS 是一个为 ADHD 考生设计的外部执行功能系统。它不是番茄钟，不是待办清单，不是时间管理工具。</p>
      <p style="margin-top:12px;"><strong>三个核心原则：</strong></p>
      <ul style="padding-left:20px;margin:6px 0;">
        <li><strong>管理启动摩擦</strong>，而非管理时间——每张卡只写能在 10 秒内开始的物理动作</li>
        <li><strong>管理情绪</strong>，而非管理任务——每天先读身体信号，再决定今天怎么学</li>
        <li><strong>管理连续性</strong>，而非追求效率——链比块重要，块比时长重要</li>
      </ul>
      <p style="margin-top:12px;"><strong>唯一 KPI：</strong>块数。不统计学习时长，不统计科目覆盖率，不统计页数。只看你每天填了几个格子。</p>
      <p style="margin-top:12px;"><strong>非零日宪法：</strong>任何一天不允许归零。正常→中等→微型→接触→物理存在。链条的五级降级机制保证你永远不会断链。</p>
    `
  },
  {
    title: '信号系统：先读身体，后选任务',
    html: `
      <p>每天早上坐在书桌前，花 10 秒扫描自己的身体状态，从五个词中选一个：<strong>平静、焦虑、无聊、疲惫、兴奋</strong>。</p>
      <p style="margin-top:12px;">这个选择决定了今天的任务策略：</p>
      <ul style="padding-left:20px;margin:6px 0;">
        <li><strong>平静：</strong>正常执行。选输出型任务，冲刺块全开。</li>
        <li><strong>焦虑：</strong>选低威胁任务。回避高难度输出型，倾向接触区和输入型。</li>
        <li><strong>无聊：</strong>开难度高的输出型任务，用挑战感激活大脑。</li>
        <li><strong>疲惫：</strong>走最小模式。1张任务卡，允许接触动作替代输出。</li>
      </ul>
      <p style="margin-top:12px;"><strong>红线：</strong>信号每日必填，选定后当天不可更改。每日先读身体信号再选任务——这是本系统最核心的机制。</p>
      <p style="margin-top:12px;">设计原理：ADHD 的情绪波动比正常人剧烈。在错误的状态硬做错误的任务 = 崩盘。信号系统让你在状态差的时候合法降低标准，而不是强迫自己在错误的状态下强行执行。</p>
    `
  },
  {
    title: '启动卡：让你的手知道该干什么',
    html: `
      <p>每张启动卡只写<strong>一行</strong>——一个具体的物理动作。不能写"复习线代"，只能写"做课本第 87 页第 3 题"。不能写"学英语"，只能写"朗读阅读真题 Passage 3"。</p>
      <p style="margin-top:12px;"><strong>三条铁律：</strong></p>
      <ul style="padding-left:20px;margin:6px 0;">
        <li><strong>10 秒启动测试：</strong>闭眼想象自己正坐在书桌前看着这张卡。你能在 10 秒内开始动吗？不能就改。</li>
        <li><strong>15 字以内：</strong>越短越好。一行。写完就不用再想"到底要做什么"。</li>
        <li><strong>禁止模糊动词：</strong>学习、复习、掌握、理解、弄懂、过一遍、看看、了解、熟悉、知道——这些词会被系统自动检测。</li>
      </ul>
      <p style="margin-top:12px;"><strong>正确示例：</strong>做课本 87 页第 3 题 / 闭卷画糖酵解全部步骤 / 背诵政治第4章框架 / 朗读 2019 年阅读 Passage 3 / 打开政治精讲第 4 章</p>
      <p style="margin-top:12px;">设计原理：ADHD 的启动困难源于任务描述模糊。"复习数学"需要大脑先解析"复习什么、怎么复习、从哪里开始"——这本身就是沉重的认知负荷。具体动作绕过了这个解析步骤。</p>
    `
  },
  {
    title: '冲刺块：50+10 不可中断',
    html: `
      <p>点击今日区的一张卡，再点"开始"，计时器开始倒计时（默认 50 分钟，可在设置中调整为 25~90 分钟）。这块时间就是你的冲刺块。</p>
      <p style="margin-top:12px;"><strong>块内三不：</strong>不离开座位、不切换科目、不碰手机。</p>
      <p style="margin-top:12px;"><strong>块结束的三种结局：</strong></p>
      <ul style="padding-left:20px;margin:6px 0;">
        <li><strong>时间到、任务未完：</strong>停手，进入 10 分钟硬休息。下一块决定是否继续。</li>
        <li><strong>任务提前完成：</strong>拿后备卡无脑续命。不需要思考"现在该做什么"。</li>
        <li><strong>卡写太小了：</strong>点 ↑ 标记，下次把卡写大一点。不需要愧疚。</li>
      </ul>
      <p style="margin-top:12px;"><strong>休息不可跳过：</strong>连续不休息 = 下午崩盘。这是红线。10 分钟硬休息意味着站起来、离开座位、不看屏幕。</p>
      <p style="margin-top:12px;">设计原理：50 分钟是 ADHD 注意力可持续的上限。25 分钟太短（刚进入状态就停），90 分钟太长（中途必然走神）。50+10 的节奏来自对 ADHD 考生实际表现的观测。你可以在"更多 → 设置"中调整块时长。</p>
    `
  },
  {
    title: '任务池与后备卡',
    html: `
      <p><strong>任务池</strong>是你的弹药库——所有你想在未来做的任务都存在这里。最多 20 张卡。超过 14 天没有动过的卡会提醒你处理。</p>
      <p style="margin-top:12px;"><strong>后备卡（4 张）</strong>是你在块内提前完成任务时的无脑续命选项。提前做完了？拿后备卡继续，不需要思考。</p>
      <p style="margin-top:12px;">后备卡的最佳实践：</p>
      <ul style="padding-left:20px;margin:6px 0;">
        <li>写你经常需要重复做的事（做下一道题、默写代谢步骤等）</li>
        <li>不同科目各一张，保证任何情境都有匹配的续命卡</li>
        <li>不要太难——后备卡的目的是填充时间，不是开启新挑战</li>
      </ul>
      <p style="margin-top:12px;">设计原理：ADHD 的"现在该做什么"瞬间是危险的——如果在块内提前完成却没有明确的下一步，你会在几秒内打开手机。后备卡消除了这个决策真空。</p>
    `
  },
  {
    title: '接触区：恐惧的渐进消解',
    html: `
      <p>接触区是为高抵触科目（通常是数学）设计的心理缓冲机制。它承认一个现实：有些科目你害怕到连打开书都困难。</p>
      <p style="margin-top:12px;"><strong>七级梯度（0→6）：</strong></p>
      <ol style="padding-left:20px;margin:6px 0;">
        <li><strong>0 级：</strong>坐到书桌前（不需要打开任何东西）</li>
        <li><strong>1 级：</strong>把数学课本从书包里拿出来，放在桌上</li>
        <li><strong>2 级：</strong>翻开课本，看目录</li>
        <li><strong>3 级：</strong>读一道例题，不解答</li>
        <li><strong>4 级：</strong>抄写一道例题</li>
        <li><strong>5 级：</strong>做一道课后习题</li>
        <li><strong>6 级：</strong>做一组习题（正常输出型块）</li>
      </ol>
      <p style="margin-top:12px;"><strong>核心规则：</strong>允许从最低开始，允许在最低停止。今天只做到 Level 2 就停了？可以。你至少比昨天多前进了一级。</p>
      <p style="margin-top:12px;">设计原理：恐惧来自"我必须完整学完这一章"的预期负荷。接触区把这个预期替换为"你只需要坐到桌前"。每一步都是合法的终点。</p>
    `
  },
  {
    title: '链：唯一不可丢失的东西',
    html: `
      <p>链是学习OS 的核心视觉反馈。每一天结束时，你的链上会多一个点：</p>
      <ul style="padding-left:20px;margin:6px 0;">
        <li><strong>满格（●）：</strong>完成目标块数</li>
        <li><strong>半格（◐）：</strong>至少完成了一个块，但未达目标</li>
        <li><strong>零（○）：</strong>没有完成任何块——这是你绝不想看到的</li>
      </ul>
      <p style="margin-top:12px;"><strong>非零日宪法：</strong>任何一天不允许归零。如果今天只能坐在桌前五分钟——那也算。第一天断了不怕，第二天就是新起点。</p>
      <p style="margin-top:12px;"><strong>降级链（从正常到不归零）：</strong></p>
      <p>正常块（50min）→ 中等块（25min）→ 微型块（10min）→ 接触动作（5min）→ 物理存在（坐在桌前 1min）</p>
      <p style="margin-top:12px;">连续天数（streak）是第二重要的数字，仅次于今日块数。180 天的链上，断 3 天只占 1.7%。</p>
      <p style="margin-top:12px;">设计原理：ADHD 容易在"断了一天"后进入"反正也断了"的全有或全无思维。非零日宪法告诉你：即使只有 1 分钟，链没有断。</p>
    `
  },
  {
    title: '崩溃恢复：用过去的自己救现在的自己',
    html: `
      <p>崩溃恢复是四个预写的密封信封，存放在"更多 → 崩溃恢复"中。你在冷静时写好，在崩溃时打开照做。</p>
      <p style="margin-top:12px;"><strong>四个信封的触发场景：</strong></p>
      <ol style="padding-left:20px;margin:6px 0;">
        <li><strong>刷手机 2 小时停不下来：</strong>站起来→冷水洗脸→坐 2 分钟不动→打开信封 2</li>
        <li><strong>觉得彻底崩了，今天废了：</strong>只需做一件事——把书从书包里拿出来放桌上。做完可以关灯睡觉。</li>
        <li><strong>连续断了 3 天，觉得全完了：</strong>3 天 = 180 天的 1.7%。你不是从零开始，你是在 -1 天的位置。</li>
        <li><strong>系统本身让我感到压迫：</strong>把便利贴全部取下来。今天只用一张。明天只保留两个区。</li>
      </ol>
      <p style="margin-top:12px;">设计原理：崩溃时不要自己想办法。崩溃时的你的判断力已经被情绪劫持了。让冷静时的你做决策。</p>
      <p style="margin-top:12px;"><strong>使用规则：</strong>打开信封后照做，不加判断。信封里的指令已经是最小可行步骤，不需要你再做任何决策。</p>
    `
  },
  {
    title: '导出与导入：你的数据只属于你',
    html: `
      <p><strong>隐私保证：</strong>所有数据存储在浏览器 localStorage 中。不上传任何服务器，不收集任何信息。你电脑上的 index.html 就是你数据的唯一副本。</p>
      <p style="margin-top:12px;"><strong>导出数据：</strong>在"更多 → 导出数据"中，系统会将全部数据下载为一个 JSON 文件。文件名包含备份时间，方便管理。</p>
      <p style="margin-top:12px;"><strong>导入数据：</strong>在"更多 → 导入数据"中，选择一个之前导出的 JSON 文件即可恢复。注意导入会覆盖当前数据。</p>
      <p style="margin-top:12px;"><strong>建议：</strong>每周导出一次，把文件存到云盘或微信收藏。JSON 文件可以用任何文本编辑器打开查看内容。</p>
      <p style="margin-top:12px;"><strong>分享：</strong>直接把 study-os-standalone.html 文件发给别人，对方双击打开即用。每个人的数据互相独立。</p>
    `
  },
  {
    title: '每日操作流程',
    html: `
      <p><strong>标准一天：</strong></p>
      <ol style="padding-left:20px;margin:6px 0;">
        <li><strong>早上（30 秒）：</strong>打开页面 → 在心情界面选一个词 → 确认今日卡数 → 从任务池选卡填入今日区</li>
        <li><strong>上午（2-4 块）：</strong>点击一张卡，点"开始" → 连续冲刺块 → 每块 50 分钟 + 10 分钟硬休息 → 提前完成就拿后备卡续命</li>
        <li><strong>中午（15 分钟）：</strong>吃饭 → 不看屏幕 → 下午换科目</li>
        <li><strong>下午（2-3 块）：</strong>换科目 → 如果信号不好，可重新打开页面选择疲惫模式走最小</li>
        <li><strong>晚上（2 分钟）：</strong>点击顶部链图看今日格子 → 检查总结 → 关灯</li>
      </ol>
      <p style="margin-top:12px;"><strong>心情选卡替代晨间决策：</strong>你只需要读身体信号，系统自动匹配今日卡数。你不需要在刚醒来、执行功能最低的时候做任何复杂选择。</p>
      <p style="margin-top:12px;"><strong>每周日晚上：</strong>校准四问（15 分钟）。检查哪些卡写得太小、哪个科目总被逃避、后备卡是否需要更新。</p>
    `
  },
];
const Onboard = {
  currentStep: 0,
  visible: false,

  show() {
    this.currentStep = 0;
    this.visible = true;
    this.render();
    document.addEventListener('keydown', this._keyHandler);
  },

  showIfNotDismissed() {
    if (localStorage.getItem('studyos_onboarding_dismissed') === 'true') return;
    this.show();
  },

  hide() {
    const checked = document.getElementById('onboardDismissCheck')?.checked || false;
    if (checked) {
      localStorage.setItem('studyos_onboarding_dismissed', 'true');
    }
    this.visible = false;
    const el = document.getElementById('onboardOverlay');
    if (el) el.remove();
    document.removeEventListener('keydown', this._keyHandler);
  },

  _keyHandler: null,

  render() {
    const old = document.getElementById('onboardOverlay');
    if (old) old.remove();

    const step = ONBOARDING_STEPS[this.currentStep];
    const isLast = this.currentStep === ONBOARDING_STEPS.length - 1;
    const isFirst = this.currentStep === 0;

    const overlay = document.createElement('div');
    overlay.id = 'onboardOverlay';
    overlay.className = 'onboard-overlay';
    overlay.innerHTML = `
      <div class="onboard-card" id="onboardCard">
        <button class="onboard-close" id="onboardClose">✕</button>
        <div class="onboard-illo">${step.svg.replace(/var\(--([^)]+)\)/g, (_, v) =>
          getComputedStyle(document.documentElement).getPropertyValue('--' + v).trim() || '#6B9A80'
        )}</div>
        <div class="onboard-title">${step.title}</div>
        <div class="onboard-desc">${step.desc}</div>
        ${isLast ? '<label class="onboard-dismiss"><input type="checkbox" id="onboardDismissCheck"> 以后不再弹出</label>' : ''}
        <div class="onboard-nav">
          <span class="onboard-steps">第 ${this.currentStep + 1} / ${ONBOARDING_STEPS.length} 步</span>
          <div class="onboard-buttons">
            ${!isFirst ? '<button class="onboard-btn prev" id="onboardPrev">← 上一步</button>' : ''}
            <button class="onboard-btn next" id="onboardNext">${isLast ? '完成' : '下一步 →'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('onboardClose').onclick = () => this.hide();
    overlay.onclick = (e) => { if (e.target === overlay) this.hide(); };
    document.getElementById('onboardNext').onclick = () => this.next();
    if (!isFirst) document.getElementById('onboardPrev').onclick = () => this.prev();
  },

  next() {
    if (this.currentStep < ONBOARDING_STEPS.length - 1) {
      const card = document.getElementById('onboardCard');
      card.classList.add('slide-left');
      setTimeout(() => {
        this.currentStep++;
        this.render();
      }, 150);
    } else {
      this.hide();
    }
  },

  prev() {
    if (this.currentStep > 0) {
      const card = document.getElementById('onboardCard');
      card.classList.add('slide-right');
      setTimeout(() => {
        this.currentStep--;
        this.render();
      }, 150);
    }
  },

  _keyHandler: null,
};

// Bind keyboard handler
Onboard._keyHandler = (e) => {
  if (!Onboard.visible) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  switch (e.key) {
    case 'ArrowRight': case ' ':
      e.preventDefault();
      Onboard.next();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      Onboard.prev();
      break;
    case 'Escape':
      Onboard.hide(false);
      break;
  }
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
