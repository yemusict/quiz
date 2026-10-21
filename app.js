/* 맞사속상영 — 실시간 상식 퀴즈 배틀 */
(() => {
'use strict';

/* ───────────── 기본 설정 ───────────── */
const SHOW_MS = 3000;       // 문제 보여주는 시간 (모든 카테고리)
const ANSWER_MS = 20000;    // 답하는 시간 (모든 카테고리)
const ANSWER_MS_BY_CAT = {};                 // 카테고리별로 다르게 하려면 예: { idiom: 30000 }
const answerMs = cat => ANSWER_MS_BY_CAT[cat] || ANSWER_MS;
const IDIOM_HINTS = [5000, 10000];           // 사자성어 힌트: 답하기 시작 후 첫 글자 5초, 두 번째 글자 10초
const HINT_MULT = [1, .75, .5];              // 힌트 사용 개수별 점수 배율
const enc = s => btoa(unescape(encodeURIComponent(s))).split('').reverse().join('');
const dec = s => { try { return decodeURIComponent(escape(atob(String(s).split('').reverse().join('')))); } catch (e) { return ''; } };
const COUNTS = [5, 10, 15, 20];
const CATS = {
  spelling: { name: '맞춤법',  icon: '✍️', c: '#FF5C7A', desc: '둘 중 바른 말 고르기' },
  idiom:    { name: '사자성어', icon: '📜', c: '#FFB443', desc: '초성 힌트 보고 쓰기' },
  proverb:  { name: '속담',    icon: '🗣️', c: '#22D3A0', desc: '빈칸에 들어갈 말 쓰기' },
  ox:       { name: '상식',    icon: '💡', c: '#4C9DFF', desc: 'O / X 퀴즈' },
  vocab:    { name: '영단어',  icon: '🔤', c: '#9D7CFF', desc: '4개 중 뜻 고르기' }
};
const LEVELS = { m: '중학생', h: '고등학생' };
const LOGO_CATS = ['spelling', 'idiom', 'proverb', 'ox', 'vocab'];
const logoHTML = (cls = 'logo') => `<div class="${cls}" role="img" aria-label="맞사속상영">${[...'맞사속상영'].map((ch, i) =>
  `<span style="--c:${CATS[LOGO_CATS[i]].c};--d:${(i * .09).toFixed(2)}s">${ch}</span>`).join('')}</div>`;
const SHAPES = ['▲', '◆', '●', '■'];
const PCOL = ['#FF7A93', '#FFC266', '#4FE3B8', '#6FB2FF', '#B39CFF', '#FF9F6B', '#7EE0FF', '#F59BD3', '#C8F06A'];

/* ───────────── 유틸 ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const randId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const fmtCode = c => String(c).replace(/(\d{4})(\d{4})/, '$1 $2');
const norm = s => String(s ?? '').normalize('NFC').replace(/[\s.,!?~'"`·:;\-_()\[\]]/g, '').toLowerCase();
const baseURL = () => location.origin + location.pathname.replace(/index\.html$/, '');
const joinURL = code => baseURL() + '?c=' + code;
const pc = name => PCOL[[...String(name)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PCOL.length];

let toastT;
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
async function sha256(str) {
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const ch of str) h = (h * 33 ^ ch.charCodeAt(0)) >>> 0; return 'x' + h.toString(16);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const chosung = w => [...w].map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');

/* 화면 전환 시 구독/타이머 정리 */
let cleanups = [];
function screen(html) {
  cleanups.forEach(f => { try { f(); } catch (e) {} });
  cleanups = [];
  confettiId++;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}
const keep = f => cleanups.push(f);
const every = (fn, ms) => { const id = setInterval(fn, ms); keep(() => clearInterval(id)); return id; };

/* ───────────── 효과음 ───────────── */
const SFX = {
  ctx: null, on: true,
  init() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f, d = .12, type = 'sine', v = .18, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + d + .03);
  },
  tick() { this.tone(1100, .06, 'square', .05); },
  go() { [660, 990].forEach((f, i) => this.tone(f, .16, 'triangle', .22, i * .12)); },
  pop() { this.tone(500 + Math.random() * 400, .09, 'sine', .16); },
  reveal() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .2, 'triangle', .18, i * .09)); },
  fanfare() { [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, .24, 'square', .07, i * .15)); }
};
document.addEventListener('pointerdown', () => SFX.init());

/* ───────────── 꽃가루 ───────────── */
let confettiId = 0;
function confetti(ms = 4500) {
  const my = ++confettiId;
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#FF5C7A', '#FFB443', '#22D3A0', '#4C9DFF', '#9D7CFF', '#ffffff'];
  const P = Array.from({ length: 180 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .6, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
    vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4, r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[Math.floor(Math.random() * cols.length)]
  }));
  const end = performance.now() + ms;
  (function f(now) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    P.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += p.vr; if (p.y > cv.height + 20 && now < end - 1500) { p.y = -20; p.x = Math.random() * cv.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
    if (now < end && my === confettiId) requestAnimationFrame(f); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(performance.now());
}

/* ───────────── 문제 은행 ───────────── */
function bank(cat, lv, custom) {
  const base = (window.QDATA && QDATA[cat] && QDATA[cat][lv]) || [];
  return base.map((x, i) => (custom && custom[i]) ? custom[i] : x);
}
function buildQ(cat, lv, idx, custom) {
  const list = bank(cat, lv, custom);
  const item = list[idx];
  const r = rng(hashStr(cat + lv + idx + JSON.stringify(item)));
  const base = { cat, lv };
  if (cat === 'spelling') {
    const [s, a, w, e] = item; const ci = r() < .5 ? 0 : 1;
    return { q: { ...base, type: 'choice', prompt: '빈칸에 알맞은 말은?', text: s, options: ci ? [w, a] : [a, w] }, correct: ci, answerText: a, explain: e || '' };
  }
  if (cat === 'ox') {
    const [s, o, e] = item;
    return { q: { ...base, type: 'ox', prompt: '맞으면 O, 틀리면 X!', text: s, options: ['O', 'X'] }, correct: Number(o) ? 0 : 1, answerText: Number(o) ? 'O' : 'X', explain: e || '' };
  }
  if (cat === 'idiom') {
    const [w, m] = item;
    return { q: { ...base, type: 'text', prompt: '뜻에 맞는 사자성어는?', text: m, hint: chosung(w), len: [...w].length, hl: enc([...w].slice(0, 2).join('')) }, answerText: w, explain: '' };
  }
  if (cat === 'proverb') {
    const [p, rawB, meaning] = item;
    const blanks = (Array.isArray(rawB) ? rawB : String(rawB).split(',')).map(x => String(x).trim()).filter(Boolean);
    let text = '', pos = 0; const lens = [];
    blanks.forEach((b, k) => { const j = p.indexOf(b, pos); if (j < 0) return; text += p.slice(pos, j) + `@@${k}@@`; pos = j + b.length; lens.push([...b.replace(/\s/g, '')].length); });
    text += p.slice(pos);
    const two = lens.length > 1;
    return { q: { ...base, type: 'text', prompt: two ? '두 빈칸에 들어갈 말은?' : '빈칸에 들어갈 말은?', text, lens, meaning: meaning || '',
        hintNote: two ? `빈칸 ${lens.length}개 · 쉼표나 띄어쓰기로 구분해서 쓰세요 (예: ${blanks.map(b => '○'.repeat([...b.replace(/\s/g, '')].length)).join(', ')})` : `빈칸은 ${lens[0]}글자 · 띄어쓰기는 틀려도 괜찮아요` },
      answerText: blanks.join(', '), explain: '속담: ' + p };
  }
  if (cat === 'vocab') {
    const [w, m] = item;
    const koToEn = idx % 2 === 1;   // 홀수 번호: 한글 뜻 → 영어 보기, 짝수 번호: 영어 → 한글 보기 (반반)
    const pool = list.map((x, i) => i).filter(i => i !== idx && list[i][1] !== m && list[i][0] !== w);
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(list[pool.splice(Math.floor(r() * pool.length), 1)[0]][koToEn ? 0 : 1]);
    const ci = Math.floor(r() * (picks.length + 1));
    const options = picks.slice(); options.splice(ci, 0, koToEn ? w : m);
    return koToEn
      ? { q: { ...base, type: 'choice', prompt: '뜻에 맞는 영단어는?', text: m, ko: true, options }, correct: ci, answerText: w, explain: `${m} = ${w}` }
      : { q: { ...base, type: 'choice', prompt: '뜻으로 알맞은 것은?', text: w, word: true, options }, correct: ci, answerText: m, explain: `${w} = ${m}` };
  }
}
function isRight(Q, v) {
  if (v == null || v === '') return false;
  return Q.q.type === 'text' ? norm(v) === norm(Q.answerText) : Number(v) === Q.correct;
}
const answerLabel = (q, v) => v == null ? '' : (q.type === 'text' ? String(v) : (q.options[v] ?? '?'));

/* 문제 본문 HTML (교사/학생 공용) */
function qBody(q) {
  let text = esc(q.text);
  if (q.cat === 'spelling') text = text.replace(/___/g, '<span class="blank">&nbsp;?&nbsp;</span>');
  if (q.cat === 'proverb') {
    const lens = q.lens || [q.len || 1];
    text = text.replace(/@@(\d+)@@/g, (_, k) => `<span class="blank boxes">${'□'.repeat(lens[k] || 1)}</span>`).replace('@@', `<span class="blank boxes">${'□'.repeat(lens[0] || 1)}</span>`);
  }
  const cls = q.word ? 'word' : (q.cat === 'idiom' || q.ko ? 'meaning' : '');
  const mean = q.cat === 'proverb' && q.meaning ? `<div class="qmeaning"><b>뜻</b>${esc(q.meaning)}</div>` : '';
  return `<div class="qtext ${cls}">${q.word ? `<span class="word">${text}</span>` : text}</div>${mean}`;
}
function hintHTML(q) {
  if (q.cat === 'idiom') return `<div class="hint">${[...q.hint].map(h => `<div class="h">${esc(h)}</div>`).join('')}</div>`;
  if (q.hintNote) return `<div class="hintnote">💡 ${esc(q.hintNote)}</div>`;
  return '';
}
function optsHTML(q, { tag = 'div', counts = null, correct = null, picked = null, disabled = false } = {}) {
  if (q.type === 'text') return '';
  const n = q.options.length;
  return `<div class="opts n${n === 2 ? 2 : 4} ${q.type === 'ox' ? 'ox-grid' : ''}">` + q.options.map((o, i) => {
    const cls = q.type === 'ox' ? `opt ox ${i ? 'x' : 'o'}` : `opt c${n === 2 ? (i ? 1 : 0) : i}`;
    const st = correct == null ? '' : (i === correct ? ' right' : ' dim');
    const pk = picked === i ? ' picked' : '';
    const inner = q.type === 'ox' ? esc(o) : `<span class="sh">${SHAPES[n === 2 ? (i ? 1 : 0) : i]}</span><span>${esc(o)}</span>`;
    const cnt = counts ? `<span class="cnt">${counts[i] || 0}</span>` : '';
    return `<${tag} class="${cls}${st}${pk}" data-i="${i}" ${tag === 'button' && disabled ? 'disabled' : ''}>${inner}${cnt}</${tag}>`;
  }).join('') + `</div>`;
}

/* ───────────── 라우터 ───────────── */
function route() {
  const c = new URLSearchParams(location.search).get('c');
  if (location.hash === '#teacher') return Teacher.entry();
  if (location.hash === '#play' || c) return Student.entry(c);
  Home();
}
window.addEventListener('hashchange', route);

/* ───────────── 홈 ───────────── */
function Home() {
  screen(`
  <section class="home">
    <div>
      ${logoHTML()}
      <p class="tagline">맞춤법 · 사자성어 · 속담 · 상식 · 영단어<br><b>우리 반 실시간 퀴즈 배틀</b></p>
    </div>
    <div class="choices">
      <button class="btn big choice pink" id="goS"><span class="em">🙋</span>학생 입장<small>학급 코드로 들어가기</small></button>
      <button class="btn big choice cyan" id="goT"><span class="em">🧑‍🏫</span>선생님<small>게임 열기 · 문제 관리</small></button>
    </div>
    ${DB.mode === 'local' ? `<p class="demo-badge">🧪 데모 모드 — Firebase 설정 전이라 <b>같은 브라우저의 탭끼리만</b> 연결돼요. 탭 하나는 선생님, 다른 탭은 학생으로 체험해 보세요.</p>` : ''}
  </section>`);
  $('#goS').onclick = () => { location.hash = '#play'; };
  $('#goT').onclick = () => { location.hash = '#teacher'; };
}

/* ═════════════════════ 학생 ═════════════════════ */
const Student = (() => {
  const S = { code: null, pid: null, name: null, live: null, me: null, players: {}, key: null, picked: null, sent: null, rejoining: false };
  const sentKey = L => (L.sid || '') + ':' + L.round;
  const SKEY = 'matyeora_student';

  function entry(prefill) {
    const saved = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
    if (saved && (!prefill || prefill === saved.code)) { S.code = saved.code; return join(saved.name, true); }
    codeScreen(prefill || '');
  }

  function codeScreen(prefill) {
    screen(`
    <div class="wrap narrow center" style="margin-top:6vh">
      ${logoHTML('logo md')}
      <div class="card" style="margin-top:28px;text-align:left">
        <h2 class="title">학급 코드 입력</h2>
        <p class="muted" style="margin-bottom:16px">선생님 화면에 보이는 8자리 숫자를 입력하세요.</p>
        <form id="f">
          <input class="input code" id="code" inputmode="numeric" autocomplete="off" maxlength="9" placeholder="0000 0000" value="${esc(prefill ? fmtCode(prefill) : '')}">
          <div class="err" id="err"></div>
          <button class="btn big block" style="margin-top:8px">다음 ▶</button>
        </form>
      </div>
      <button class="btn ghost" style="margin-top:20px" onclick="location.href='${baseURL()}'">← 처음으로</button>
    </div>`);
    const inp = $('#code');
    inp.oninput = () => { const d = inp.value.replace(/\D/g, '').slice(0, 8); inp.value = d.length > 4 ? d.slice(0, 4) + ' ' + d.slice(4) : d; };
    if (!prefill) inp.focus();
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const code = inp.value.replace(/\D/g, '');
      if (code.length !== 8) return ($('#err').textContent = '8자리 숫자를 모두 입력해 주세요.');
      const meta = await DB.get(`rooms/${code}/meta`).catch(() => null);
      if (!meta) return ($('#err').textContent = '학급 코드를 찾을 수 없어요. 다시 확인해 주세요.');
      S.code = code; nameScreen();
    };
  }

  function nameScreen(msg = '') {
    screen(`
    <div class="wrap narrow center" style="margin-top:6vh">
      ${logoHTML('mini-logo')}
      <div class="card" style="margin-top:20px;text-align:left">
        <p class="muted small">학급 코드 <b style="color:var(--yellow)">${fmtCode(S.code)}</b></p>
        <h2 class="title">이름을 알려 주세요</h2>
        <p class="muted" style="margin-bottom:16px">순위표에 나올 이름이에요. <b>본명</b>으로 써 주세요.</p>
        <form id="f">
          <input class="input" id="nm" maxlength="10" autocomplete="off" placeholder="예: 김민준" style="font-size:26px;text-align:center">
          <div class="err" id="err">${esc(msg)}</div>
          <button class="btn big block pink" style="margin-top:8px">입장하기 🚀</button>
        </form>
      </div>
      <button class="btn ghost" style="margin-top:20px" id="back">← 코드 다시 입력</button>
    </div>`);
    $('#nm').focus();
    $('#back').onclick = () => codeScreen('');
    $('#f').onsubmit = e => { e.preventDefault(); join($('#nm').value); };
  }

  async function join(rawName, silent = false) {
    const name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!name) { if (!silent) $('#err').textContent = '이름을 입력해 주세요.'; else nameScreen(); return; }
    const meta = await DB.get(`rooms/${S.code}/meta`).catch(() => null);
    if (!meta) { sessionStorage.removeItem(SKEY); return codeScreen(''); }
    const pkey = 'matyeora_pid_' + S.code + '_' + name;
    let pid = localStorage.getItem(pkey);
    if (!pid) { pid = randId(); localStorage.setItem(pkey, pid); }
    const players = (await DB.get(`rooms/${S.code}/players`)) || {};
    const clash = Object.entries(players).find(([id, p]) => p && p.name === name && id !== pid);
    if (clash) { const m = '같은 이름이 이미 들어와 있어요. 이름 뒤에 번호를 붙여 주세요! (예: 김민준2)'; return silent ? nameScreen(m) : ($('#err').textContent = m); }
    const live = (await DB.get(`rooms/${S.code}/live`)) || {};
    const mine = players[pid];
    if (mine && mine.sid === (live.sid || '')) await DB.update(`rooms/${S.code}/players/${pid}`, { name });
    else await DB.set(`rooms/${S.code}/players/${pid}`, { name, score: 0, sid: live.sid || '', joinedAt: DB.TS });
    S.pid = pid; S.name = name;
    sessionStorage.setItem(SKEY, JSON.stringify({ code: S.code, name }));
    play();
  }

  function play() {
    S.key = null; S.leaving = false; S.wasIn = false;
    screen(`
    <section class="st">
      <div class="head">${logoHTML('mini-logo')}<span class="spacer"></span><span class="me">${esc(S.name)}<b id="myScore">0점</b></span>
        <button class="iconbtn" id="leave" title="나가기">🚪</button></div>
      <div class="main" id="stm"></div>
    </section>`);
    $('#leave').onclick = () => {
      if (!confirm('게임에서 나갈까요?')) return;
      S.leaving = true; DB.remove(`rooms/${S.code}/players/${S.pid}`); sessionStorage.removeItem(SKEY);
      location.href = baseURL();
    };
    keep(DB.on(`rooms/${S.code}/live`, v => { S.live = v; render(); }));
    keep(DB.on(`rooms/${S.code}/players`, v => {
      S.players = v || {};
      S.me = S.players[S.pid] || null;
      const sc = $('#myScore'); if (sc) sc.textContent = (S.me ? S.me.score || 0 : 0) + '점';
      const pc2 = $('#pcount'); if (pc2) pc2.textContent = Object.keys(S.players).length;
      if (!S.me && S.wasIn && S.live && S.live.sid === S.mySid && S.live.status === 'lobby') { // 선생님이 내보냄
        S.leaving = true; sessionStorage.removeItem(SKEY); return nameScreen('선생님이 이름을 다시 입력하도록 했어요.');
      }
      if (S.me) { S.wasIn = true; S.mySid = S.me.sid; }
      if (!S.me && !S.rejoining && !S.leaving) {   // 새 게임이 열리면 자동 재입장
        S.rejoining = true;
        DB.set(`rooms/${S.code}/players/${S.pid}`, { name: S.name, score: 0, sid: (S.live && S.live.sid) || '', joinedAt: DB.TS })
          .finally(() => setTimeout(() => { S.rejoining = false; }, 800));
      }
      if (S.live && S.live.status === 'result') render(true);
    }));
    every(tick, 100);
  }

  function myRank() {
    const arr = Object.entries(S.players).map(([id, p]) => ({ id, s: p.score || 0 })).sort((a, b) => b.s - a.s);
    const i = arr.findIndex(x => x.id === S.pid);
    return { rank: i < 0 ? '-' : arr.filter(x => x.s > (arr[i] || {}).s).length + 1, total: arr.length };
  }

  function render(force) {
    const L = S.live, m = $('#stm'); if (!m) return;
    const status = (L && L.status) || 'idle';
    const key = status + ':' + (L ? L.round : 0) + ':' + (L ? L.sid : '');
    if (key === S.key && !force) return;
    if (force && status !== 'result') return;
    if (key !== S.key) confettiId++;
    S.key = key;
    if (status === 'idle') {
      m.innerHTML = `<div class="big-emoji bounce">🎮</div><h2 class="title">선생님이 게임을 준비하고 있어요<span class="waitdots"></span></h2><p class="muted">이 화면을 켜 두면 자동으로 시작돼요.</p>`;
    } else if (status === 'lobby') {
      const cat = CATS[L.cat] || {};
      m.innerHTML = `<div class="big-emoji">✅</div><h2 class="title">${esc(S.name)}, 입장 완료!</h2>
        <div><span class="badge" style="--c:${cat.c}">${cat.icon} ${cat.name} · ${LEVELS[L.lv]}</span></div>
        <p class="muted" style="font-size:20px">함께하는 친구 <b id="pcount" style="color:var(--yellow)">${Object.keys(S.players).length}</b>명</p>
        <p class="muted bounce" style="margin-top:20px">선생님이 시작하면 바로 문제가 나와요 ⏳</p>`;
    } else if (status === 'show' || status === 'answer') {
      const q = L.q, cat = CATS[q.cat];
      if (status === 'show') S.picked = null;
      const can = status === 'answer' && S.sent !== sentKey(L);
      m.innerHTML = `
        <div class="row" style="justify-content:center"><span class="badge" style="--c:${cat.c}">${cat.icon} ${cat.name}</span><span class="badge plain">${L.round} / ${L.total}</span></div>
        <div class="bar ${status === 'answer' ? 'go' : ''}" id="tbar"><i></i></div>
        <div class="phase-label ${status === 'answer' ? 'go' : ''}" style="align-self:center">${status === 'show' ? '👀 문제를 읽어요' : '⚡ 지금 답하세요!'}</div>
        <div class="q"><div class="muted small" style="margin-bottom:6px">${esc(q.prompt)}</div>${qBody(q).replace('qtext', 'qs')}</div>
        ${hintHTML(q)}
        <div id="ansArea"></div>`;
      const area = $('#ansArea');
      setTimeout(applyHints, 0);
      if (S.hintKey !== sentKey(L)) { S.hintKey = sentKey(L); S.hintsUsed = []; }
      if (S.sent === sentKey(L)) {
        area.innerHTML = `${q.type !== 'text' ? optsHTML(q, { tag: 'button', picked: S.picked, disabled: true }) : ''}<p class="pts" style="font-size:26px;margin-top:12px">제출 완료! 👍</p>`;
      } else if (q.type === 'text') {
        area.innerHTML = (q.hl && status === 'answer' ? `<div class="hintbtns">${IDIOM_HINTS.map((ms, k) =>
            `<button class="btn ghost sm hb" data-k="${k}" disabled>💡 ${k ? '두 번째' : '첫'} 글자 <small>${ms / 1000}초 후</small></button>`).join('')}
            <p class="dim small">힌트 1개마다 점수 ${Math.round((1 - HINT_MULT[1]) * 100)}%씩 줄어요</p></div>` : '') +
          `<form id="tf" class="row" style="flex-wrap:nowrap">
          <input class="input" id="ta" maxlength="20" autocomplete="off" placeholder="${can ? '정답 입력' : '곧 입력할 수 있어요'}" ${can ? '' : 'disabled'} style="font-size:24px;text-align:center">
          <button class="btn green" ${can ? '' : 'disabled'}>제출</button></form>`;
        if (can) { $('#ta').focus(); $('#tf').onsubmit = e => { e.preventDefault(); const v = $('#ta').value.trim(); if (v) send(v); }; }
        $$('#ansArea .hb').forEach(b => b.onclick = () => { const k = Number(b.dataset.k); if (!S.hintsUsed.includes(k)) S.hintsUsed.push(k); applyHints(); $('#ta') && $('#ta').focus(); });
      } else {
        area.innerHTML = optsHTML(q, { tag: 'button', disabled: !can });
        if (can) $$('#ansArea .opt').forEach(b => b.onclick = () => { S.picked = Number(b.dataset.i); send(S.picked); });
      }
    } else if (status === 'result') {
      const last = S.me && S.me.last && S.me.last.round === L.round ? S.me.last : null;
      const { rank, total } = myRank();
      let v;
      if (!last) v = `<div class="big-emoji">⏳</div><div class="verdict">채점 중<span class="waitdots"></span></div>`;
      else if (last.ok) v = `<div class="big-emoji">🎉</div><div class="verdict ok">정답!</div><div class="pts">+${last.pts}점</div>`;
      else if (last.answered) v = `<div class="big-emoji">😢</div><div class="verdict no">아쉬워요</div>`;
      else v = `<div class="big-emoji">⏰</div><div class="verdict no">시간 초과</div>`;
      m.innerHTML = `${v}
        <div class="q"><div class="muted small">정답</div><div style="font-family:var(--display);font-size:32px;color:var(--ok)">${esc(L.reveal ? L.reveal.answer : '')}</div></div>
        <p style="font-size:22px">지금 <b style="color:var(--yellow)">${rank}위</b> / ${total}명 · 총 ${S.me ? S.me.score || 0 : 0}점</p>
        <p class="muted small">다음 문제를 기다려요…</p>`;
      if (last && last.ok && S.confRound !== L.round) { S.confRound = L.round; confetti(1600); }
    } else if (status === 'final') {
      const list = L.final || [];
      const i = list.findIndex(x => x.id === S.pid);
      const r = i < 0 ? null : list.filter(x => x.score > list[i].score).length + 1;
      const medal = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '🏁';
      m.innerHTML = `<div class="big-emoji">${medal}</div><h2 class="title">${r ? `오늘 ${r}위!` : '게임 종료'}</h2>
        <p style="font-size:24px">${list.length}명 중 · <b style="color:var(--yellow)">${i < 0 ? 0 : list[i].score}점</b></p>
        <div class="board" style="text-align:left;margin-top:10px">${list.slice(0, 3).map((p, k) => `<div class="li"><span class="rk">${k + 1}</span>${esc(p.name)}<span class="sc">${p.score}</span></div>`).join('')}</div>
        <p class="muted small" style="margin-top:12px">수고했어요! 👏</p>`;
      if (r && r <= 3) confetti();
    }
  }

  function applyHints() {
    const L = S.live; if (!L || !L.q || !L.q.hl || S.hintKey !== sentKey(L)) return;
    const letters = [...dec(L.q.hl)];
    S.hintsUsed.forEach(k => { const t = $$('.hint .h')[k]; if (t && letters[k]) { t.textContent = letters[k]; t.classList.add('rev'); } });
    $$('#ansArea .hb').forEach(b => { if (S.hintsUsed.includes(Number(b.dataset.k))) { b.disabled = true; b.classList.add('used'); b.innerHTML = '✓ 힌트 사용'; } });
  }

  async function send(v) {
    const L = S.live; if (!L || L.status !== 'answer' || S.sent === sentKey(L)) return;
    if (DB.now() > L.phaseEnd + 300) return toast('시간이 끝났어요!');
    const h = S.hintKey === sentKey(L) ? S.hintsUsed.length : 0;
    S.sent = sentKey(L);
    S.key = null; render();
    try { await DB.set(`rooms/${S.code}/answers/${L.round}/${S.pid}`, { v, t: DB.TS, h }); }
    catch (e) { S.sent = null; toast('전송 실패! 다시 눌러 주세요.'); S.key = null; render(); }
  }

  function tick() {
    const L = S.live, bar = $('#tbar i'); if (!L || !bar) return;
    const total = L.status === 'show' ? SHOW_MS : (L.answerMs || ANSWER_MS);
    const left = Math.max(0, L.phaseEnd - DB.now());
    bar.style.width = (left / total * 100) + '%';
    if (L.status === 'answer' && left <= 0) { $$('#ansArea button, #ansArea input').forEach(el => el.disabled = true); return; }
    if (L.status === 'answer') {
      const elapsed = total - left;
      $$('#ansArea .hb').forEach(b => {
        const k = Number(b.dataset.k); if (S.hintsUsed.includes(k)) return;
        const wait = Math.ceil((IDIOM_HINTS[k] - elapsed) / 1000);
        b.disabled = wait > 0;
        b.innerHTML = `💡 ${k ? '두 번째' : '첫'} 글자 ${wait > 0 ? `<small>${wait}초 후</small>` : '보기'}`;
      });
    }
  }

  return { entry };
})();

/* ═════════════════════ 교사 ═════════════════════ */
const Teacher = (() => {
  const T = { code: null, meta: null, progress: {}, custom: {}, sel: { cat: 'spelling', lv: 'm', n: 10 }, sess: null, players: {} };
  const TKEY = 'matyeora_teacher';
  const R = p => `rooms/${T.code}/${p}`;
  const pkey = (c, l) => `${c}_${l}`;

  function entry() {
    const saved = sessionStorage.getItem(TKEY);
    if (saved) { T.code = saved; return consoleScreen(); }
    login('find');
  }

  function login(tab) {
    screen(`
    <div class="wrap narrow" style="margin-top:4vh">
      <div class="center">${logoHTML('logo md')}<p class="muted" style="margin:10px 0 22px">선생님 페이지</p></div>
      <div class="card">
        <div class="tabs"><button data-t="find" class="${tab === 'find' ? 'on' : ''}">🔑 내 학급 열기</button><button data-t="new" class="${tab === 'new' ? 'on' : ''}">✨ 새 학급 만들기</button></div>
        ${tab === 'find' ? `
        <form id="f">
          <label class="field"><span>학급 찾기 문구 또는 8자리 학급 코드</span><input class="input" id="key" placeholder="예: 종암2026202" autocomplete="off"></label>
          <label class="field"><span>비밀번호</span><input class="input" id="pw" type="password" autocomplete="current-password"></label>
          <div class="err" id="err"></div>
          <button class="btn big block">입장하기</button>
        </form>` : `
        <form id="f">
          <p class="muted small" style="margin-bottom:14px">학급마다 <b>8자리 학급 코드</b>가 자동으로 만들어져요. 코드를 잊어도 <b>찾기 문구</b>로 다시 찾을 수 있어요.</p>
          <label class="field"><span>학급 찾기 문구 (다른 선생님과 겹치지 않게)</span><input class="input" id="key" placeholder="예: 종암2026202" autocomplete="off"></label>
          <label class="field"><span>비밀번호 (4자 이상)</span><input class="input" id="pw" type="password" autocomplete="new-password"></label>
          <label class="field"><span>비밀번호 확인</span><input class="input" id="pw2" type="password" autocomplete="new-password"></label>
          <div class="err" id="err"></div>
          <button class="btn big block pink">학급 만들기</button>
        </form>`}
      </div>
      <div class="center"><button class="btn ghost" style="margin-top:20px" onclick="location.href='${baseURL()}'">← 처음으로</button></div>
    </div>`);
    $$('.tabs button').forEach(b => b.onclick = () => login(b.dataset.t));
    $('#key').focus();
    const err = m => { $('#err').textContent = m; };
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const key = $('#key').value.trim().replace(/\s+/g, ' '), pw = $('#pw').value;
      try {
        if (tab === 'find') {
          if (!key || !pw) return err('문구(또는 코드)와 비밀번호를 입력해 주세요.');
          let code = /^\d{4}\s?\d{4}$/.test(key) ? key.replace(/\D/g, '') : await DB.get('phrases/' + await sha256('p:' + key.toLowerCase()));
          if (!code) return err('그 문구로 만든 학급이 없어요.');
          const meta = await DB.get(`rooms/${code}/meta`);
          if (!meta) return err('학급을 찾을 수 없어요.');
          if (await sha256(code + ':' + pw) !== meta.pwHash) return err('비밀번호가 맞지 않아요.');
          T.code = code; sessionStorage.setItem(TKEY, code); consoleScreen();
        } else {
          if (key.length < 3) return err('찾기 문구는 3자 이상으로 써 주세요.');
          if (/^\d{8}$/.test(key.replace(/\s/g, ''))) return err('찾기 문구는 8자리 숫자만으로는 만들 수 없어요.');
          if (pw.length < 4) return err('비밀번호는 4자 이상으로 해 주세요.');
          if (pw !== $('#pw2').value) return err('비밀번호 확인이 일치하지 않아요.');
          const ph = await sha256('p:' + key.toLowerCase());
          if (await DB.get('phrases/' + ph)) return err('이미 사용 중인 문구예요. 다른 문구를 정해 주세요.');
          let code;
          for (let i = 0; i < 20; i++) { const c = String(10000000 + Math.floor(Math.random() * 90000000)); if (!(await DB.get(`rooms/${c}/meta`))) { code = c; break; } }
          await DB.set(`rooms/${code}/meta`, { phrase: key, pwHash: await sha256(code + ':' + pw), createdAt: DB.TS });
          await DB.set('phrases/' + ph, code);
          T.code = code; sessionStorage.setItem(TKEY, code);
          toast(`학급 코드 ${fmtCode(code)} 가 만들어졌어요!`, 4000);
          consoleScreen();
        }
      } catch (ex) { console.error(ex); err('연결 오류: ' + (ex.message || ex)); }
    };
  }

  async function loadRoom() {
    const [meta, progress, custom] = await Promise.all([DB.get(R('meta')), DB.get(R('progress')), DB.get(R('custom'))]);
    T.meta = meta; T.progress = progress || {}; T.custom = custom || {};
    return !!meta;
  }

  async function consoleScreen() {
    if (!(await loadRoom())) { sessionStorage.removeItem(TKEY); return login('find'); }
    const live = await DB.get(R('live'));
    if (live && ['lobby', 'show', 'answer', 'result'].includes(live.status)) await DB.update(R('live'), { status: 'idle' });
    const s = T.sel;
    const catCards = Object.entries(CATS).map(([k, c]) => {
      const len = bank(k, s.lv, T.custom[pkey(k, s.lv)]).length;
      const p = (T.progress[pkey(k, s.lv)] || 0) % len;
      return `<button class="cat ${s.cat === k ? 'sel' : ''}" data-cat="${k}" style="--c:${c.c}">
        <span class="ic">${c.icon}</span><span class="nm">${c.name}</span><span class="ds">${c.desc}</span>
        <span class="pg">다음 문제 <b>${p + 1}번</b> / ${len}<span class="bar"><i style="width:${p / len * 100}%"></i></span></span></button>`;
    }).join('');
    screen(`
    <div class="topbar">${logoHTML('mini-logo')}<span class="spacer"></span>
      <span class="codechip">학급 코드<b>${fmtCode(T.code)}</b></span>
      <span class="codechip">찾기 문구 · ${esc(T.meta.phrase)}</span>
      <button class="btn ghost sm" id="logout">로그아웃</button></div>
    <div class="wrap">
      ${DB.mode === 'local' ? `<p class="demo-badge" style="margin-bottom:16px">🧪 데모 모드: 이 브라우저의 다른 탭에서 <b>${esc(baseURL())}?c=${T.code}</b> 를 열면 학생으로 들어올 수 있어요.</p>` : ''}
      <h2 class="title">오늘은 어떤 퀴즈? 🎯</h2>
      <div class="section-h">1. 카테고리</div>
      <div class="cats">${catCards}</div>
      <div class="row" style="margin-top:24px;gap:28px">
        <div><div class="section-h" style="margin-top:0">2. 수준</div>
          <div class="seg" id="lv">${Object.entries(LEVELS).map(([k, v]) => `<button data-v="${k}" class="${s.lv === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
        <div><div class="section-h" style="margin-top:0">3. 오늘 풀 문제 수</div>
          <div class="seg" id="cnt">${COUNTS.map(n => `<button data-v="${n}" class="${s.n === n ? 'on' : ''}">${n}문제</button>`).join('')}</div></div>
      </div>
      <div class="row" style="margin-top:32px">
        <button class="btn big pink" id="open">🎮 대기실 열기</button>
        <span class="spacer"></span>
        <button class="btn violet" id="edit">📝 문제 보기·수정</button>
      </div>
      <p class="muted small" style="margin-top:22px">⏱ 문제 보기 ${SHOW_MS / 1000}초 → 답하기 ${ANSWER_MS / 1000}초 · 빨리 맞힐수록 높은 점수 (최대 1000점, 정답이면 최소 500점) · 진행 중에도 문제를 추가할 수 있어요</p>
    </div>`);
    $$('.cat').forEach(b => b.onclick = () => { s.cat = b.dataset.cat; consoleScreen(); });
    $$('#lv button').forEach(b => b.onclick = () => { s.lv = b.dataset.v; consoleScreen(); });
    $$('#cnt button').forEach(b => b.onclick = () => { s.n = Number(b.dataset.v); $$('#cnt button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#open').onclick = openLobby;
    $('#edit').onclick = () => editor(s.cat, s.lv);
    $('#logout').onclick = () => { sessionStorage.removeItem(TKEY); location.hash = ''; location.href = baseURL(); };
  }

  /* ── 대기실 ── */
  async function openLobby() {
    SFX.init();
    const { cat, lv, n } = T.sel;
    T.sess = { sid: randId(), cat, lv, total: n, round: 0 };
    await DB.update(`rooms/${T.code}`, { players: null, answers: null, live: { sid: T.sess.sid, status: 'lobby', cat, lv, total: n, round: 0 } });
    const c = CATS[cat], url = joinURL(T.code);
    screen(`
    <div class="topbar">${logoHTML('mini-logo')}<span class="badge" style="--c:${c.c}">${c.icon} ${c.name} · ${LEVELS[lv]} · ${n}문제</span><span class="spacer"></span>
      <button class="iconbtn" id="fs" title="전체 화면">⛶</button></div>
    <section class="lobby">
      <div class="card joinbox">
        <div class="qrbox"><div id="qr"></div></div>
        <div class="bigcode">${fmtCode(T.code)}</div>
        <div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>
        <p class="muted small" style="margin-top:10px">QR을 찍거나, 주소에 접속해 학급 코드를 입력하세요<br>잘못 들어온 이름은 눌러서 내보낼 수 있어요</p>
      </div>
      <div class="card" style="min-height:60vh;display:flex;flex-direction:column">
        <div class="row"><div><span class="count" id="pc">0</span><span class="muted" style="font-size:20px"> 명 입장</span></div><span class="spacer"></span>
          <button class="btn ghost" id="cancel">취소</button><button class="btn big green" id="start">시작하기 ▶</button></div>
        <div class="players" id="pl" style="margin-top:20px"><p class="muted waitdots" style="font-size:22px">친구들을 기다리는 중</p></div>
      </div>
    </section>`);
    if (window.QRCode) new QRCode($('#qr'), { text: url, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M });
    else $('#qr').innerHTML = `<p style="color:#2a1468;padding:20px">QR 생성기를 불러오지 못했어요.<br>주소를 직접 알려 주세요.</p>`;
    let prev = 0;
    keep(DB.on(R('players'), v => {
      T.players = v || {};
      const list = Object.values(T.players).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      $('#pc').textContent = list.length;
      const ent = Object.entries(T.players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
      if (list.length) $('#pl').innerHTML = ent.map(([id, p]) => `<button class="pchip" data-id="${id}" title="눌러서 내보내기" style="--c:${pc(p.name)}">${esc(p.name)}</button>`).join('');
      else $('#pl').innerHTML = '<p class="muted waitdots" style="font-size:22px">친구들을 기다리는 중</p>';
      $$('#pl .pchip').forEach(b => b.onclick = () => { if (confirm(`'${b.textContent}' 학생을 내보낼까요?`)) DB.remove(R('players/' + b.dataset.id)); });
      if (list.length > prev) SFX.pop();
      prev = list.length;
    }));
    $('#fs').onclick = toggleFS;
    $('#cancel').onclick = async () => { await DB.update(R('live'), { status: 'idle' }); consoleScreen(); };
    $('#start').onclick = () => {
      if (!Object.keys(T.players).length && !confirm('아직 입장한 학생이 없어요. 그래도 시작할까요?')) return;
      gameScreen(); nextRound();
    };
  }

  function toggleFS() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  /* ── 게임 진행 ── */
  function gameScreen() {
    const s = T.sess, c = CATS[s.cat];
    screen(`
    <section class="game">
      <div class="hud">
        ${logoHTML('mini-logo')}
        <span class="badge" style="--c:${c.c}">${c.icon} ${c.name} · ${LEVELS[s.lv]}</span>
        <span class="badge plain" id="rd"></span>
        <span class="spacer"></span>
        <span class="answered" id="ac"></span>
        <div class="timer" id="tm"><svg viewBox="0 0 100 100"><circle class="tr" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="0"/></svg><div class="num">10</div></div>
        <button class="btn sm" id="skip">건너뛰기 ⏭</button>
        <button class="btn ghost sm" id="addq" title="총 문제 수를 1개 늘려요">＋ 문제 추가</button>
        <button class="iconbtn" id="snd" title="소리">🔊</button>
        <button class="iconbtn" id="fs" title="전체 화면">⛶</button>
        <button class="btn ghost sm" id="stop">그만하기</button>
      </div>
      <div class="stage" id="stage"></div>
    </section>`);
    $('#fs').onclick = toggleFS;
    $('#snd').onclick = e => { SFX.on = !SFX.on; e.currentTarget.textContent = SFX.on ? '🔊' : '🔇'; };
    $('#skip').onclick = () => { if (s.phase === 'show') startAnswer(); else if (s.phase === 'answer') endAnswer(); };
    $('#stop').onclick = () => { if (confirm('지금까지 점수로 최종 순위를 볼까요?')) finish(); };
    $('#addq').onclick = () => addQuestions(1);
    keep(DB.on(R('players'), v => { T.players = v || {}; updateAnswered(); }));
    let lastSec = -1;
    every(() => {
      if (!s || !s.phaseEnd || (s.phase !== 'show' && s.phase !== 'answer')) return;
      const total = s.phase === 'show' ? SHOW_MS : s.ansMs;
      const left = s.phaseEnd - DB.now();
      const sec = Math.max(0, Math.ceil(left / 1000));
      const tm = $('#tm'); if (!tm) return;
      tm.querySelector('.fg').style.strokeDashoffset = 276.5 * (1 - Math.max(0, left) / total);
      tm.querySelector('.num').textContent = sec;
      tm.classList.toggle('hot', s.phase === 'answer' && sec <= 3);
      if (s.phase === 'answer' && sec !== lastSec && sec <= 3 && sec > 0) SFX.tick();
      lastSec = sec;
      if (left <= 0 && s.phase === 'show') startAnswer();
      else if (left <= -400 && s.phase === 'answer') endAnswer();
    }, 100);
  }

  function roundLabel() {
    const s = T.sess, el = $('#rd'); if (el && s) el.textContent = `${s.round} / ${s.total} 문제 · #${s.idx + 1}`;
  }
  async function addQuestions(n) {
    const s = T.sess; if (!s) return;
    s.total += n; roundLabel();
    toast(`문제를 ${n}개 추가했어요 · 총 ${s.total}문제`);
    await DB.update(R('live'), { total: s.total });
    if (s.phase === 'result') renderResult();
  }

  function updateAnswered() {
    const s = T.sess, el = $('#ac'); if (!el || !s) return;
    const total = Object.keys(T.players).length;
    if (s.phase === 'answer' || s.phase === 'show') el.innerHTML = `${s.answerCount || 0} / ${total}<small>응답</small>`;
    else el.innerHTML = '';
  }

  async function nextRound() {
    const s = T.sess;
    s.round++;
    const key = pkey(s.cat, s.lv), custom = T.custom[key];
    const len = bank(s.cat, s.lv, custom).length;
    const idx = (T.progress[key] || 0) % len;
    const Q = buildQ(s.cat, s.lv, idx, custom);
    Object.assign(s, { Q, idx, phase: 'show', phaseEnd: DB.now() + SHOW_MS, ended: false, answerCount: 0, ansMs: answerMs(s.cat) });
    T.progress[key] = (idx + 1) % len;
    roundLabel();
    $('#skip').classList.remove('hidden'); $('#tm').classList.remove('hidden');
    renderQuestion();
    await DB.update(`rooms/${T.code}`, {
      [`progress/${key}`]: T.progress[key],
      [`answers/${s.round}`]: null,
      'live/status': 'show', 'live/round': s.round, 'live/total': s.total, 'live/qNo': idx + 1, 'live/q': Q.q, 'live/answerMs': s.ansMs,
      'live/phaseEnd': s.phaseEnd, 'live/reveal': null, 'live/stats': null, 'live/answerStart': null
    });
  }

  function renderQuestion() {
    const s = T.sess, q = s.Q.q;
    $('#stage').innerHTML = `
      <div class="phase-label ${s.phase === 'answer' ? 'go' : ''}" id="ph">${s.phase === 'show' ? '👀 문제를 읽어요' : '⚡ 지금 답하세요!'}</div>
      <div class="prompt">${esc(q.prompt)}</div>
      ${qBody(q)}
      ${hintHTML(q)}
      ${optsHTML(q)}`;
    updateAnswered();
  }

  async function startAnswer() {
    const s = T.sess; if (s.phase !== 'show') return;
    s.phase = 'answer'; s.phaseEnd = DB.now() + s.ansMs;
    SFX.go();
    const ph = $('#ph'); if (ph) { ph.textContent = '⚡ 지금 답하세요!'; ph.classList.add('go'); }
    await DB.update(R('live'), { status: 'answer', phaseEnd: s.phaseEnd, answerStart: DB.TS });
    const round = s.round;
    s.unsubAns = DB.on(R(`answers/${round}`), v => {
      if (s.round !== round) return;
      s.answerCount = v ? Object.keys(v).length : 0;
      updateAnswered();
      const total = Object.keys(T.players).length;
      if (s.phase === 'answer' && total > 0 && s.answerCount >= total) setTimeout(endAnswer, 500);
    });
    keep(s.unsubAns);
  }

  async function endAnswer() {
    const s = T.sess; if (s.phase !== 'answer' || s.ended) return;
    s.ended = true; s.phase = 'result';
    if (s.unsubAns) s.unsubAns();
    $('#skip').classList.add('hidden'); $('#tm').classList.add('hidden'); updateAnswered();
    const [ans, players, live] = await Promise.all([DB.get(R(`answers/${s.round}`)), DB.get(R('players')), DB.get(R('live'))]);
    const Q = s.Q, A = s.ansMs, start = (live && live.answerStart) || (s.phaseEnd - A);
    const rows = Object.entries(players || {}).map(([pid, p]) => {
      const a = ans && ans[pid];
      if (!a) return { pid, name: p.name, v: null, ok: false, pts: 0, ms: null, h: 0, prev: p.score || 0 };
      const ok = isRight(Q, a.v);
      const ms = Math.max(0, Math.min(A, (a.t || start) - start));
      const h = Math.max(0, Math.min(2, Number(a.h) || 0));
      return { pid, name: p.name, v: a.v, ok, ms, h, pts: ok ? Math.round((500 + 500 * (1 - ms / A)) * HINT_MULT[h]) : 0, prev: p.score || 0 };
    });
    const nOk = rows.filter(r => r.ok).length, nNa = rows.filter(r => r.v == null).length, nNo = rows.length - nOk - nNa;
    let dist = null;
    if (Q.q.type !== 'text') { dist = Q.q.options.map(() => 0); rows.forEach(r => { if (r.v != null && dist[r.v] != null) dist[r.v]++; }); }
    const up = {};
    rows.forEach(r => {
      up[`players/${r.pid}/score`] = r.prev + r.pts;
      up[`players/${r.pid}/last`] = { round: s.round, ok: r.ok, pts: r.pts, answered: r.v != null };
    });
    Object.assign(up, {
      'live/status': 'result',
      'live/reveal': { answer: Q.answerText, explain: Q.explain || '', correct: Q.correct ?? -1 },
      'live/stats': { ok: nOk, no: nNo, na: nNa }
    });
    await DB.update(`rooms/${T.code}`, up);
    s.rows = rows; s.dist = dist; s.stats = { ok: nOk, no: nNo, na: nNa };
    SFX.reveal();
    renderResult();
  }

  function renderResult() {
    const s = T.sess, Q = s.Q, q = Q.q, rows = s.rows, st = s.stats, tot = rows.length || 1;
    const board = rows.map(r => ({ ...r, score: r.prev + r.pts })).sort((a, b) => b.score - a.score).slice(0, 5);
    let detail;
    if (q.type === 'text') {
      const groups = {};
      rows.filter(r => r.v != null && !r.ok).forEach(r => { const k = norm(r.v); (groups[k] = groups[k] || { t: String(r.v).trim(), n: 0 }).n++; });
      const g = Object.values(groups).sort((a, b) => b.n - a.n).slice(0, 40), max = Math.max(1, ...g.map(x => x.n));
      detail = `<div class="muted" style="margin-top:16px">오답 구름 ☁️</div><div class="cloud">${g.length ? g.map((x, i) =>
        `<span style="font-size:${18 + 38 * x.n / max}px;color:${PCOL[i % PCOL.length]};animation-delay:${i * .04}s" title="${x.n}명">${esc(x.t)}</span>`).join('') : '<span class="none">오답이 없어요! 🎉</span>'}</div>`;
    } else {
      const max = Math.max(1, ...s.dist);
      const colors = q.type === 'ox' ? ['var(--blue)', 'var(--red)'] : (q.options.length === 2 ? ['var(--red)', 'var(--blue)'] : ['var(--red)', 'var(--blue)', 'var(--gold)', 'var(--emerald)']);
      detail = `<div class="muted" style="margin-top:16px">선택한 사람 수</div><div class="distr">${q.options.map((o, i) =>
        `<div class="r ${i === Q.correct ? 'right' : ''}" style="--c:${colors[i]}"><span class="lab">${q.type === 'ox' ? '' : SHAPES[q.options.length === 2 ? i : i] + ' '}${esc(o)}</span><span class="track"><i style="width:${s.dist[i] / max * 100}%"></i></span><span class="n">${s.dist[i]}</span></div>`).join('')}</div>`;
    }
    const last = s.round >= s.total;
    $('#stage').innerHTML = `
      <div class="reveal">
        <div>
          <div class="answer-card"><div class="lbl">정답</div><div class="ans">${esc(Q.answerText)}</div></div>
          ${Q.explain ? `<div class="explain">💡 ${esc(Q.explain)}</div>` : ''}
          <div class="card" style="margin-top:16px">
            <div class="legend"><span><i style="background:var(--ok)"></i>정답 ${st.ok}명</span><span><i style="background:var(--bad)"></i>오답 ${st.no}명</span><span><i style="background:rgba(255,255,255,.3)"></i>미응답 ${st.na}명</span></div>
            <div class="statbar">${st.ok ? `<div class="ok" style="flex:${st.ok}">${Math.round(st.ok / tot * 100)}%</div>` : ''}${st.no ? `<div class="no" style="flex:${st.no}">${st.no}</div>` : ''}${st.na ? `<div class="na" style="flex:${st.na}">${st.na}</div>` : ''}${!rows.length ? '<div class="na" style="flex:1">참가자 없음</div>' : ''}</div>
            ${detail}
            <button class="detail-toggle" id="dt">🔒 개인별 응답 보기 (교사용)</button>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="section-h" style="margin-top:0">🏅 현재 TOP 5</div>
            <div class="board">${board.map((r, i) => `<div class="li" style="animation-delay:${i * .06}s"><span class="rk">${i + 1}</span>${esc(r.name)}${r.pts ? `<span class="plus">+${r.pts}</span>` : ''}<span class="sc">${r.score}</span></div>`).join('') || '<p class="muted">참가자가 없어요</p>'}</div>
          </div>
          <div class="row" style="margin-top:18px;justify-content:flex-end">
            ${last ? `<button class="btn big" id="nx">🏆 최종 순위 보기</button>` : `<button class="btn big green" id="nx">다음 문제 ▶</button>`}
          </div>
        </div>
      </div>`;
    $('#nx').onclick = () => last ? finish() : nextRound();
    $('#dt').onclick = showDetail;
  }

  function showDetail() {
    const s = T.sess, q = s.Q.q;
    const rows = s.rows.slice().sort((a, b) => (b.ok - a.ok) || ((a.v == null) - (b.v == null)) || ((a.ms ?? 1e9) - (b.ms ?? 1e9)));
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="card"><div class="row"><h2 class="title" style="font-size:24px">개인별 응답 · ${s.round}번째 문제</h2><span class="spacer"></span><button class="iconbtn" id="mx">✕</button></div>
      <table class="table"><thead><tr><th>이름</th><th>응답</th><th>결과</th><th>걸린 시간</th>${q.hl ? '<th>힌트</th>' : ''}<th>점수</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.v == null ? '<span class="dim">—</span>' : esc(answerLabel(q, r.v))}</td>
        <td class="${r.ok ? 'o' : 'x'}">${r.ok ? '⭕ 정답' : r.v == null ? '미응답' : '❌ 오답'}</td><td>${r.ms == null ? '' : (r.ms / 1000).toFixed(1) + '초'}</td>${q.hl ? `<td>${r.h ? '💡'.repeat(r.h) : ''}</td>` : ''}<td>${r.pts ? '+' + r.pts : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.onclick = e => { if (e.target === m) close(); };
    $('#mx', m).onclick = close;
    keep(close);
  }

  async function finish() {
    const s = T.sess; s.phase = 'final';
    if (s.unsubAns) s.unsubAns();
    const players = (await DB.get(R('players'))) || {};
    const list = Object.entries(players).map(([id, p]) => ({ id, name: p.name, score: p.score || 0 })).sort((a, b) => b.score - a.score);
    await DB.update(R('live'), { status: 'final', final: list });
    const rankOf = i => list.filter(x => x.score > list[i].score).length + 1;
    const pod = [1, 0, 2].map(i => list[i] ? `<div class="pod p${i + 1}"><div class="medal" style="animation-delay:${.6 + (2 - i) * .2}s">${['🥇', '🥈', '🥉'][rankOf(i) - 1] || '🏅'}</div><div class="nm">${esc(list[i].name)}</div><div class="sc">${list[i].score}점</div><div class="blk">${rankOf(i)}</div></div>` : `<div class="pod"></div>`).join('');
    const c = CATS[s.cat];
    screen(`
    <section class="final">
      <div class="badge" style="--c:${c.c}">${c.icon} ${c.name} · ${LEVELS[s.lv]} · ${s.round}문제</div>
      <h1>🏆 오늘의 상식왕</h1>
      <div class="podium">${pod}</div>
      ${list.length > 3 ? `<div class="rest">${list.slice(3).map((p, k) => `<span>${rankOf(k + 3)}위<b>${esc(p.name)}</b>${p.score}</span>`).join('')}</div>` : ''}
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn big green" id="more">＋ 5문제 이어서 (점수 유지)</button>
        <button class="btn big pink" id="again">🔁 새 게임</button>
        <button class="btn big ghost" id="home">처음 화면으로</button>
      </div>
    </section>`);
    SFX.fanfare(); setTimeout(() => confetti(5000), 900);
    $('#again').onclick = openLobby;
    $('#more').onclick = () => { s.total = s.round + 5; gameScreen(); nextRound(); };
    $('#home').onclick = () => consoleScreen();
  }

  /* ── 문제 편집 ── */
  const FIELDS = {
    spelling: [['문장 (빈칸 자리에 ___ 를 넣으세요)', 'text'], ['정답', 'text'], ['오답', 'text'], ['해설 (선택)', 'text']],
    ox: [['문장', 'text'], ['정답', 'ox'], ['해설 (선택)', 'text']],
    idiom: [['사자성어 (한글 4글자)', 'text'], ['뜻', 'area']],
    proverb: [['속담 전체', 'text'], ['빈칸으로 만들 말 (2개면 쉼표로 구분, 속담에 나오는 순서대로)', 'text'], ['뜻', 'area']],
    vocab: [['영단어', 'text'], ['뜻', 'text']]
  };
  function preview(cat, it) {
    if (cat === 'spelling') return it[0].replace('___', `[${it[1]} / ${it[2]}]`);
    if (cat === 'ox') return `${Number(it[1]) ? '⭕' : '❌'} ${it[0]}`;
    if (cat === 'idiom') return `${it[0]} — ${it[1]}`;
    if (cat === 'proverb') { let t = it[0]; (Array.isArray(it[1]) ? it[1] : String(it[1]).split(',')).forEach(b => { b = String(b).trim(); if (b) t = t.replace(b, `[${b}]`); }); return t + (it[2] ? ` — ${it[2]}` : ''); }
    if (cat === 'vocab') return `${it[0]} — ${it[1]}`;
  }
  function editor(cat, lv) {
    const key = pkey(cat, lv);
    const draw = () => {
      const custom = T.custom[key] || {}, list = bank(cat, lv, custom), next = (T.progress[key] || 0) % list.length;
      const f = ($('#q') && $('#q').value.trim().toLowerCase()) || '';
      $('#ql').innerHTML = list.map((it, i) => ({ it, i })).filter(({ it }) => !f || JSON.stringify(it).toLowerCase().includes(f)).map(({ it, i }) =>
        `<div class="qrow ${custom[i] ? 'edited' : ''} ${i === next ? 'next' : ''}" data-i="${i}"><div class="top"><span class="no">${i + 1}</span>
          <span class="pv">${esc(preview(cat, it))}</span>${i === next ? '<span class="tag nx">다음 출제</span>' : ''}${custom[i] ? '<span class="tag">수정됨</span>' : ''}
          ${i === next ? '' : '<button class="btn ghost sm" data-act="from" title="다음 게임을 이 문제부터 시작">▶ 여기부터</button>'}
          <button class="btn ghost sm" data-act="edit">수정</button></div></div>`).join('');
      $$('#ql [data-act=edit]').forEach(b => b.onclick = () => openForm(b.closest('.qrow')));
      $$('#ql [data-act=from]').forEach(b => b.onclick = () => setStart(Number(b.closest('.qrow').dataset.i)));
      const sn = $('#startNo'); if (sn && document.activeElement !== sn) sn.value = next + 1;
      const tot = $('#startTot'); if (tot) tot.textContent = list.length;
    };
    const setStart = async i => {
      const len = bank(cat, lv, T.custom[key]).length;
      i = ((Math.round(i) % len) + len) % len;
      T.progress[key] = i; await DB.set(R(`progress/${key}`), i);
      toast(`다음 게임은 ${i + 1}번 문제부터 출제돼요`); draw();
      const n = $('.qrow.next'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const openForm = row => {
      if ($('form', row)) return $('form', row).remove();
      const i = Number(row.dataset.i), custom = T.custom[key] || {}, it = bank(cat, lv, custom)[i];
      const fm = document.createElement('form');
      fm.innerHTML = FIELDS[cat].map(([lab, t], k) => `<label class="field"><span>${lab}</span>${
        t === 'ox' ? `<select class="input" name="f${k}"><option value="1" ${Number(it[k]) ? 'selected' : ''}>O (맞다)</option><option value="0" ${Number(it[k]) ? '' : 'selected'}>X (틀리다)</option></select>`
        : t === 'area' ? `<textarea class="input" name="f${k}">${esc(it[k] || '')}</textarea>` : `<input class="input" name="f${k}" value="${esc(Array.isArray(it[k]) ? it[k].join(', ') : (it[k] ?? ''))}" style="font-size:17px">`}</label>`).join('') +
        `<div class="err"></div><div class="row"><button class="btn green sm">저장</button>${custom[i] ? '<button type="button" class="btn ghost sm" data-act="reset">원래 문제로 되돌리기</button>' : ''}
         <button type="button" class="btn ghost sm" data-act="here">이 문제부터 출제</button><span class="spacer"></span><span class="dim small">미리보기는 저장 후 목록에서 확인</span></div>`;
      row.appendChild(fm);
      fm.onsubmit = async e => {
        e.preventDefault();
        const v = FIELDS[cat].map((_, k) => String(fm[`f${k}`].value).trim());
        const err = m => { $('.err', fm).textContent = m; };
        if (cat === 'ox') v[1] = Number(v[1]);
        if (!v[0] || (cat !== 'ox' && !v[1])) return err('필수 칸을 채워 주세요.');
        if (cat === 'spelling' && !v[0].includes('___')) return err('문장에 빈칸 표시 ___ (밑줄 3개)를 넣어 주세요.');
        if (cat === 'spelling' && (!v[2] || v[1] === v[2])) return err('정답과 다른 오답을 입력해 주세요.');
        if (cat === 'proverb') {
          const bl = v[1].split(',').map(x => x.trim()).filter(Boolean);
          if (bl.length < 1 || bl.length > 2) return err('빈칸은 1개 또는 2개로 정해 주세요.');
          let pos = 0;
          for (const b of bl) { const j = v[0].indexOf(b, pos); if (j < 0) return err(`'${b}'이(가) 속담 안에 (순서대로) 들어 있지 않아요.`); pos = j + b.length; }
          v[1] = bl;
        }
        if (cat === 'spelling' && !v[3]) v.pop();
        if (cat === 'ox' && !v[2]) v.pop();
        await DB.set(R(`custom/${key}/${i}`), v);
        T.custom[key] = { ...(T.custom[key] || {}), [i]: v };
        toast(`${i + 1}번 문제를 저장했어요`); draw();
      };
      const rs = $('[data-act=reset]', fm);
      if (rs) rs.onclick = async () => {
        await DB.remove(R(`custom/${key}/${i}`));
        const c = { ...(T.custom[key] || {}) }; delete c[i]; T.custom[key] = c;
        toast('원래 문제로 되돌렸어요'); draw();
      };
      $('[data-act=here]', fm).onclick = () => setStart(i);
    };
    screen(`
    <div class="topbar">${logoHTML('mini-logo')}<span class="spacer"></span><button class="btn ghost sm" id="bk">← 돌아가기</button></div>
    <div class="wrap">
      <h2 class="title">📝 문제 보기 · 수정</h2>
      <p class="muted small">수정한 문제는 이 학급에만 저장돼요. 분홍 줄이 다음 게임에서 먼저 나올 문제예요.</p>
      <div class="row" style="margin-top:16px">
        <select class="input" id="ec" style="width:auto">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select>
        <div class="seg" id="el">${Object.entries(LEVELS).map(([k, v]) => `<button data-v="${k}" class="${lv === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <input class="input" id="q" placeholder="🔍 검색" style="flex:1;min-width:160px;font-size:17px">
      </div>
      <form class="startbox" id="sf">
        <span>▶ 다음 게임 시작 위치</span>
        <input class="input" id="startNo" type="number" min="1" inputmode="numeric">
        <span class="muted">번 / <b id="startTot"></b>문제</span>
        <button class="btn sm">적용</button>
        <button type="button" class="btn ghost sm" id="startFirst">처음(1번)부터</button>
      </form>
      <div class="qlist" id="ql"></div>
    </div>`);
    $('#bk').onclick = () => consoleScreen();
    $('#ec').onchange = e => editor(e.target.value, lv);
    $$('#el button').forEach(b => b.onclick = () => editor(cat, b.dataset.v));
    $('#q').oninput = draw;
    $('#sf').onsubmit = e => { e.preventDefault(); const v = Number($('#startNo').value); if (v >= 1) setStart(v - 1); };
    $('#startFirst').onclick = () => setStart(0);
    draw();
    const n = $('.qrow.next'); if (n) n.scrollIntoView({ block: 'center' });
  }

  return { entry };
})();

route();
})();
