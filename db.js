// 데이터 저장소: Firebase Realtime Database (설정 시) 또는 로컬 데모 모드
window.DB = (() => {
  const cfg = window.FIREBASE_CONFIG || {};
  if (cfg.apiKey && cfg.databaseURL && window.firebase) {
    firebase.initializeApp(cfg);
    const db = firebase.database();
    let offset = 0;
    db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
    return {
      mode: 'firebase',
      TS: firebase.database.ServerValue.TIMESTAMP,
      now: () => Date.now() + offset,
      get: async p => (await db.ref(p).get()).val(),
      set: (p, v) => db.ref(p).set(v),
      update: (p, v) => db.ref(p).update(v),
      remove: p => db.ref(p).remove(),
      on(p, cb) {
        const r = db.ref(p);
        const h = r.on('value', s => cb(s.val()));
        return () => r.off('value', h);
      }
    };
  }

  // ── 데모 모드: localStorage + BroadcastChannel (같은 브라우저 탭끼리 실시간 공유)
  const KEY = 'matyeora_demo_db_v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  let tree = load();
  const subs = new Set();
  const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('matyeora') : null;
  const parts = p => String(p).split('/').filter(Boolean);
  const getAt = p => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), tree);
  const TS = { '.sv': 'timestamp' };
  const resolve = v => {
    if (v && typeof v === 'object') {
      if (v['.sv'] === 'timestamp') return Date.now();
      const o = Array.isArray(v) ? [] : {};
      for (const k in v) o[k] = resolve(v[k]);
      return o;
    }
    return v;
  };
  function setAt(p, v) {
    const ks = parts(p);
    if (!ks.length) { tree = v || {}; return; }
    let o = tree;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = v;
  }
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  function notify() {
    subs.forEach(s => {
      const j = JSON.stringify(getAt(s.p) === undefined ? null : getAt(s.p));
      if (j !== s.last) { s.last = j; s.cb(JSON.parse(j)); }
    });
  }
  function commit() {
    localStorage.setItem(KEY, JSON.stringify(tree));
    if (bc) bc.postMessage(1);
    notify();
  }
  const reload = () => { tree = load(); notify(); };
  // 여러 탭이 동시에 쓸 때 서로 덮어쓰지 않도록 잠금
  const locked = fn => {
    const run = () => { tree = load(); fn(); commit(); };
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('matyeora_demo_db', run);
    return Promise.resolve().then(run);
  };
  if (bc) bc.onmessage = reload;
  window.addEventListener('storage', e => { if (e.key === KEY) reload(); });

  return {
    mode: 'local',
    TS,
    now: () => Date.now(),
    get: async p => { tree = load(); return clone(getAt(p)); },
    set: (p, v) => locked(() => setAt(p, resolve(v))),
    update: (p, obj) => locked(() => { for (const k in obj) setAt(p + '/' + k, resolve(obj[k])); }),
    remove: p => locked(() => setAt(p, null)),
    on(p, cb) {
      const s = { p, cb, last: JSON.stringify(clone(getAt(p))) };
      subs.add(s);
      setTimeout(() => cb(JSON.parse(s.last)), 0);
      return () => subs.delete(s);
    }
  };
})();
