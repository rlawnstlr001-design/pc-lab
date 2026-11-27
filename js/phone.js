// 가짜 폰: 잠금 화면 · 홈 · 메신저 · 사진 · 메모 · 전화 · 안쪽 잠금 · 수사 노트 (메일·은행·캘린더·위치 기록은 apps2.js)
import { esc, bar, avatar, photo, fmtDay, fmtTime, fmtClock, fmtLockDate, fmtShortDay, sameDay, fmtDur, toast, go } from './ui.js?v=202611270055';
import { progress, checkCode, loadSecretDev, rpc, track, startPlay } from './store.js?v=202611270055';
import { APP_META2, notiText, pinLine, mailList, mailView, bank, calendar, maps } from './apps2.js?v=202611270055';

const APP_META = {
  messenger: { name: '메신저', icon: '✉', bg: '#0f7b6c', path: 'm' },
  gallery: { name: '사진', icon: '▦', bg: '#c4602a', path: 'g' },
  notes: { name: '메모', icon: '✎', bg: '#d1a20f', path: 'n' },
  calls: { name: '전화', icon: '☏', bg: '#3e64c9', path: 'c' },
  ...APP_META2,
};

// ── 볼 수 있는가 ───────────────────────────────
export const phoneOpen = (c, s) => !c.lock || s.unlocked.includes('lock');
export const canSee = (c, s, it) => phoneOpen(c, s) && (!it.locked_by || s.unlocked.includes(it.locked_by));

function markOpened(slug, ids) {
  progress.update(slug, (s) => { for (const id of ids) if (!s.opened.includes(id)) s.opened.push(id); });
}
function contactName(c, pid) {
  const t = c.threads?.find((th) => th.members.length === 2 && th.members.includes(pid) && th.members.includes(c.owner));
  return t ? t.title : (c.person.get(pid)?.name || '알 수 없음');
}
const base = (c) => `cases/${c.slug}/`;
const preview = (it) => (it.deleted ? '삭제된 메시지' : it.img ? '사진' : it.text);
const statusBar = (c, dark) => `<div class="status" style="${dark ? 'color:#fff' : ''}"><span>${fmtClock(c.now)}</span><span>LTE ▮▮▮ 38%</span></div>`;

// ── 잠금 화면 ─────────────────────────────────
function keypad(len, entered) {
  const dots = Array.from({ length: len }, (_, i) => `<i class="${i < entered ? 'on' : ''}"></i>`).join('');
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}">${n}</button>`).join('');
  return `<div class="dots">${dots}</div><div class="keypad">${keys}<button class="fn" data-key="hint">힌트</button><button data-key="0">0</button><button class="fn" data-key="del">지우기</button></div>`;
}

function lockScreen(c, s) {
  const notis = (c.lock.notifications || []).map((id) => c.byId.get(id)).filter(Boolean).map((it) => {
    const n2 = notiText(c, it);
    if (n2) return `<div class="noti"><b><span>${APP_META[it.app].name} · ${esc(n2[0])}</span><span>${fmtShortDay(it.at)} ${fmtClock(it.at)}</span></b>${esc(n2[1])}</div>`;
    const who = it.app === 'messenger' ? (c.threads.find((t) => t.id === it.thread)?.title || '') : contactName(c, it.with);
    const what = it.app === 'messenger' ? preview(it) : it.app === 'calls' ? (it.dir === 'missed' ? '부재중 전화' : '통화') : it.title || '';
    return `<div class="noti"><b><span>${APP_META[it.app]?.name || ''} · ${esc(who)}</span><span>${fmtShortDay(it.at)} ${fmtClock(it.at)}</span></b>${esc(what)}</div>`;
  }).join('');
  // 배경 그림: 배포본 버전(?v=)을 붙여 캐시 꼬임을 막고, 그래도 못 불러오면 설명 글로 대신 보여 준다(11/27 Lv9 배경 안 뜸)
  const ver = new URL(import.meta.url).search;
  const wall = c.lock.wallpaper ? `<img class="wall" src="${esc(base(c) + c.lock.wallpaper + ver)}" alt="" onerror="this.closest('.lock').classList.add('nowall')"><p class="wall-text">${esc(c.lock.wallpaper_alt || '')}</p>` : '';
  // 배경화면 설명 글은 화면 읽기용(aria)으로만 — 그림이 있으니 눈에는 '배경 보기'로 직접 보게 한다
  const wallAlt = c.lock.wallpaper ? `<button class="peek-btn" data-peek="1" aria-label="배경화면 보기: ${esc(c.lock.wallpaper_alt || '')}">배경 보기</button>` : '';
  return `<div class="lock" id="lockview">${wall}${statusBar(c, true)}
    <div class="clock"><b>${fmtClock(c.now)}</b>${fmtLockDate(c.now)}</div>
    ${wallAlt}
    <div class="scroll notis">${notis}</div>
    <div class="keypad-wrap"><p style="text-align:center;margin:0 0 4px;font-size:13px">비밀번호 ${c.lock.length}자리</p>${keypad(c.lock.length, 0)}</div>
  </div>`;
}

// 숫자판 동작(폰 잠금·안쪽 잠금 공용)
function wireKeypad(root, { slug, lockId, length, hash, onOpen, hintKey }) {
  let code = '';
  const dots = () => root.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i < code.length));
  root.querySelector('.keypad').addEventListener('click', async (e) => {
    const k = e.target.closest('button')?.dataset.key;
    if (!k) return;
    if (k === 'del') { code = code.slice(0, -1); dots(); return; }
    if (k === 'hint') {
      const st = progress.caseState(slug);
      const n = st.tries[lockId] || 0;
      if (n < 3) { toast(`세 번 틀리면 힌트가 열려요 (${n}/3)`); return; }
      const idx = Math.floor((n - 3) / 2) + 1;               // 두 번 더 틀릴 때마다 다음 힌트
      const sec = await loadSecretDev(slug);
      let hint = sec ? (sec.hints?.[hintKey] || [])[Math.min(idx, (sec.hints?.[hintKey] || []).length) - 1] : null;
      if (!sec) hint = (await rpc('pc_hint', { p_slug: slug, p_lock: hintKey, p_n: idx })) || (await rpc('pc_hint', { p_slug: slug, p_lock: hintKey, p_n: 1 }));
      if (!hint) { toast('힌트를 불러오지 못했어요'); return; }
      toast(hint);
      progress.update(slug, (s) => { s.hints = (s.hints || 0) + 1; });
      track(slug, 'hint', { lock: lockId, n: idx });
      return;
    }
    if (code.length >= length) return;
    code += k; dots();
    if (code.length < length) return;
    if (await checkCode(slug, lockId, code, hash)) {
      progress.update(slug, (s) => { if (!s.unlocked.includes(lockId)) s.unlocked.push(lockId); });
      track(slug, 'unlock', { lock: lockId, tries: (progress.caseState(slug).tries[lockId] || 0) + 1 });
      onOpen();
    } else {
      progress.update(slug, (s) => { s.tries[lockId] = (s.tries[lockId] || 0) + 1; });
      const pad = root.querySelector('.keypad-wrap, .code-sheet') || root;
      pad.classList.remove('shake'); void pad.offsetWidth; pad.classList.add('shake');
      code = ''; setTimeout(dots, 250);
    }
  });
}

// ── 홈 ─────────────────────────────────────
function home(c, lv) {
  const icons = c.apps.filter((a) => APP_META[a]).map((a) => {
    const m = APP_META[a];
    return `<button class="icon" data-go="#/lv/${lv}/${m.path}"><span style="background:${m.bg}">${m.icon}</span>${m.name}</button>`;
  }).join('');
  return `<div class="home">${statusBar(c, true)}
    <div class="icons">${icons}</div>
    <div class="dock">
      <button class="btn ghost" style="color:#fff;border-color:#ffffff44" data-go="#/lv/${lv}/pins">📌 수사 노트</button>
      <button class="btn" data-go="#/lv/${lv}/accuse">진실 맞히기</button>
      <button class="btn ghost" style="color:#fff;border-color:#ffffff22;font-size:13px" data-go="#/">레벨 지도로</button>
    </div></div>`;
}

// ── 메신저 ───────────────────────────────────
function messengerList(c, s, lv) {
  const rows = c.threads.map((t) => {
    const msgs = c.items.filter((it) => it.app === 'messenger' && it.thread === t.id && canSee(c, s, it)).sort((a, b) => a.at.localeCompare(b.at));
    const last = msgs[msgs.length - 1];
    const other = c.person.get(t.members.find((m) => m !== c.owner));
    return { t, last, other };
  }).filter((r) => r.last).sort((a, b) => b.last.at.localeCompare(a.last.at));
  return bar('메신저', `#/lv/${lv}/phone`) + `<div class="scroll list">${rows.map(({ t, last, other }) =>
    `<button class="row" data-go="#/lv/${lv}/m/${esc(t.id)}">${avatar(other)}<div class="mid"><b>${esc(t.title)}</b><span>${esc(preview(last))}</span></div><time>${fmtShortDay(last.at)}</time></button>`).join('')}</div>`;
}

function thread(c, s, lv, tid) {
  const t = c.threads.find((x) => x.id === tid);
  if (!t) return bar('메신저', `#/lv/${lv}/m`) + '<p class="pad muted">대화방이 없어요.</p>';
  const msgs = c.items.filter((it) => it.app === 'messenger' && it.thread === tid && canSee(c, s, it)).sort((a, b) => a.at.localeCompare(b.at));
  markOpened(c.slug, msgs.map((m) => m.id));
  const group = t.members.length > 2;
  let prev = null;
  const html = msgs.map((m) => {
    const day = !prev || !sameDay(prev.at, m.at) ? `<div class="day">${fmtDay(m.at)}</div>` : '';
    if (m.system) { prev = m; return `${day}<button class="sysmsg" data-pin="${esc(m.id)}">${esc(m.text)} <time>${fmtTime(m.at)}</time></button>`; }   // 들어왔습니다·나갔습니다 같은 안내
    const me = m.from === c.owner;
    const who = group && !me && (!prev || prev.from !== m.from || day) ? `<div class="who">${esc(c.person.get(m.from)?.short || '')}</div>` : '';
    prev = m;
    const saved = s.saved.includes(m.id) ? ' saved' : '';
    const body = m.deleted ? '<span class="bubble deleted">삭제된 메시지예요</span>'
      : m.img ? `<button class="bubble" data-photo="${esc(m.id)}" style="padding:4px">${photo(m.img, m.alt || '사진', 'inline-photo', base(c))}</button>`
      : `<button class="bubble" data-pin="${esc(m.id)}">${esc(m.text)}</button>`;
    return `${day}${who}<div class="msg${me ? ' me' : ''}${saved}">${body}<time>${fmtTime(m.at)}</time></div>`;
  }).join('');
  return bar(t.title, `#/lv/${lv}/m`) + `<div class="scroll" id="chat"><div class="chat">${html}</div></div><p class="small muted" style="text-align:center;margin:6px">말풍선을 누르면 수사 노트에 저장돼요</p>`;
}

// ── 사진 ─────────────────────────────────────
function gallery(c, s, lv, album) {
  const items = c.items.filter((it) => it.app === 'gallery' && (it.album || 'main') === album).sort((a, b) => b.at.localeCompare(a.at));
  const hidden = c.items.filter((it) => it.app === 'gallery' && it.album === 'hidden');
  if (album === 'hidden') {
    const lockId = hidden[0]?.locked_by;
    if (lockId && !s.unlocked.includes(lockId)) return codeSheet(c, lv, lockId, `#/lv/${lv}/g/hidden`, `#/lv/${lv}/g`);
  }
  const grid = items.map((it) => `<button class="${s.saved.includes(it.id) ? 'saved photo' : ''}" data-go="#/lv/${lv}/p/${esc(it.id)}">${photo(it.img, it.alt, 'thumb', base(c))}</button>`).join('');
  const tile = album === 'main' && hidden.length ? `<button class="album-tile" data-go="#/lv/${lv}/g/hidden"><span>🔒 숨긴 앨범</span><span class="muted">${hidden.length}</span></button>` : '';
  return bar(album === 'hidden' ? '숨긴 앨범' : '사진', album === 'hidden' ? `#/lv/${lv}/g` : `#/lv/${lv}/phone`) + `<div class="scroll"><div class="grid">${grid}</div>${tile}</div>`;
}

function photoView(c, s, lv, id) {
  const it = c.byId.get(id);
  if (!it || !canSee(c, s, it)) return bar('사진', `#/lv/${lv}/g`) + '<p class="pad muted">볼 수 없는 사진이에요.</p>';
  markOpened(c.slug, [id]);
  const back = it.app === 'mail' ? `#/lv/${lv}/e/${it.id}` : it.app === 'messenger' ? `#/lv/${lv}/m/${it.thread}` : `#/lv/${lv}/g${it.album === 'hidden' ? '/hidden' : ''}`;
  const pinned = s.saved.includes(id);
  return bar('', back, `<button data-pin="${esc(id)}" style="font-size:14px">${pinned ? '📌 저장됨' : '📌 저장'}</button>`) +
    `<div class="photo-view">${photo(it.img, it.alt, 'img', base(c))}
      <div class="photo-meta"><div><span>찍은 때</span>${fmtDay(it.at)} ${fmtTime(it.at)}</div><div><span>장소</span>${esc(it.place || '정보 없음')}</div>
      ${it.app === 'messenger' ? `<div><span>받은 곳</span>메신저 · ${esc(c.threads.find((t) => t.id === it.thread)?.title || '')}</div>` : ''}</div></div>`;
}

// ── 메모 ─────────────────────────────────────
function notes(c, s, lv) {
  const items = c.items.filter((it) => it.app === 'notes').sort((a, b) => b.at.localeCompare(a.at));
  return bar('메모', `#/lv/${lv}/phone`) + `<div class="scroll">${items.map((it) => {
    const locked = it.locked_by && !s.unlocked.includes(it.locked_by);
    return `<button class="note-card${s.saved.includes(it.id) ? ' saved' : ''}" data-go="#/lv/${lv}/n/${esc(it.id)}"><b>${locked ? '🔒 잠긴 메모' : esc(it.title)}</b><span class="small muted">${fmtDay(it.at)}</span></button>`;
  }).join('')}</div>`;
}
function noteView(c, s, lv, id) {
  const it = c.byId.get(id);
  if (it?.locked_by && !s.unlocked.includes(it.locked_by)) return codeSheet(c, lv, it.locked_by, `#/lv/${lv}/n/${id}`, `#/lv/${lv}/n`);
  if (!it) return bar('메모', `#/lv/${lv}/n`);
  markOpened(c.slug, [id]);
  return bar(it.title, `#/lv/${lv}/n`, `<button data-pin="${esc(id)}" style="font-size:14px">${s.saved.includes(id) ? '📌 저장됨' : '📌 저장'}</button>`) +
    `<div class="scroll"><div class="note-body">${esc(it.text)}</div><p class="pad small muted">${fmtDay(it.at)} ${fmtTime(it.at)}</p></div>`;
}

// ── 전화 ─────────────────────────────────────
function calls(c, s, lv) {
  const items = c.items.filter((it) => it.app === 'calls' && canSee(c, s, it)).sort((a, b) => b.at.localeCompare(a.at));
  markOpened(c.slug, items.map((i) => i.id));
  const icon = { in: '↙', out: '↗', missed: '✕' };
  let prev = null;
  return bar('최근 기록', `#/lv/${lv}/phone`) + `<div class="scroll">${items.map((it) => {
    const day = !prev || !sameDay(prev.at, it.at) ? `<div class="small muted" style="padding:10px 16px 4px">${fmtDay(it.at)}</div>` : '';
    prev = it;
    return `${day}<button class="call${it.dir === 'missed' ? ' missed' : ''}${s.saved.includes(it.id) ? ' saved' : ''}" data-pin="${esc(it.id)}"><span class="dir">${icon[it.dir]}</span><div class="mid" style="flex:1"><b>${esc(contactName(c, it.with))}</b><div class="small muted">${it.dir === 'missed' ? '부재중' : it.dir === 'out' ? '건 전화' : '받은 전화'} · ${fmtDur(it.dur_sec)}</div></div><time class="small muted">${fmtTime(it.at)}</time></button>`;
  }).join('')}</div><p class="small muted" style="text-align:center;margin:6px">기록을 누르면 수사 노트에 저장돼요</p>`;
}

// ── 안쪽 잠금 ────────────────────────────────
function codeSheet(c, lv, lockId, okHash, backHash) {
  const L = (c.locks || []).find((l) => l.id === lockId);
  setTimeout(() => wireKeypad(document.getElementById('codesheet'), {
    slug: c.slug, lockId, length: L.length, hash: L.hash, hintKey: lockId,
    onOpen: () => { toast('열렸어요'); go(okHash); window.dispatchEvent(new HashChangeEvent('hashchange')); },
  }));
  return bar(L.label || '잠김', backHash) + `<div class="code-sheet" id="codesheet"><p style="font-size:40px;margin:10px 0 0">🔒</p><p><b>${esc(L.label || '잠긴 항목')}</b> — 비밀번호 ${L.length}자리</p>${keypad(L.length, 0)}</div>`;
}

// ── 수사 노트 ────────────────────────────────
function pins(c, s, lv) {
  const items = s.saved.map((id) => c.byId.get(id)).filter(Boolean);
  const line = (it) => {
    if (it.app === 'messenger' && it.system) return `<b>안내</b> · ${esc(it.text)}`;
    if (it.app === 'messenger') return `<b>${it.from === c.owner ? '나' : esc(c.person.get(it.from)?.short || '')}</b> · ${esc(preview(it))}`;
    if (it.app === 'gallery') return `<b>사진</b> · ${esc(it.alt)}`;
    if (it.app === 'notes') return `<b>메모</b> · ${esc(it.title)}`;
    const l2 = pinLine(c, it); if (l2) return l2;
    if (it.app === 'calls') return `<b>전화</b> · ${esc(contactName(c, it.with))} ${it.dir === 'missed' ? '부재중' : fmtDur(it.dur_sec)}`;
    return '';
  };
  return bar('수사 노트', `#/lv/${lv}/phone`) + `<div class="scroll pad">${items.length ? items.map((it) =>
    `<div class="exp"><div class="small muted">${fmtDay(it.at)} ${fmtTime(it.at)}</div>${line(it)}</div>`).join('') :
    '<p class="muted">아직 저장한 단서가 없어요. 메시지·사진·메모·기록을 누르면 여기에 모여요.</p>'}</div>`;
}

// ── 진입점 ─────────────────────────────────
const H = { canSee, markOpened, base };
export function renderPhone(c, lv, view, arg) {
  const s = progress.caseState(c.slug);
  if (!s.startedAt) { progress.update(c.slug, (x) => { x.startedAt = Date.now(); }); startPlay(c.slug); track(c.slug, 'open_phone'); }
  if (!phoneOpen(c, s)) {
    setTimeout(() => wireKeypad(document.getElementById('lockview'), {
      slug: c.slug, lockId: 'lock', length: c.lock.length, hash: c.lock.hash, hintKey: 'lock',
      onOpen: () => { toast('잠금이 풀렸어요'); window.dispatchEvent(new HashChangeEvent('hashchange')); },
    }));
    return lockScreen(c, s);
  }
  switch (view) {
    case 'm': return arg ? thread(c, s, lv, arg) : messengerList(c, s, lv);
    case 'g': return gallery(c, s, lv, arg === 'hidden' ? 'hidden' : 'main');
    case 'p': return photoView(c, s, lv, arg);
    case 'n': return arg ? noteView(c, s, lv, arg) : notes(c, s, lv);
    case 'c': return calls(c, s, lv);
    case 'pins': return pins(c, s, lv);
    case 'e': return arg && arg !== 'sent' ? mailView(c, s, lv, arg, H) : mailList(c, s, lv, arg, H);
    case 'b': return bank(c, s, lv, H);
    case 'k': return calendar(c, s, lv, H);
    case 'l': return maps(c, s, lv, arg, H);
    default: return home(c, lv);
  }
}

// 저장(📌) 토글 — app.js의 클릭 위임에서 부른다
export function togglePin(slug, id) {
  let on = false;
  progress.update(slug, (s) => {
    const i = s.saved.indexOf(id);
    if (i >= 0) s.saved.splice(i, 1); else { s.saved.push(id); on = true; }
  });
  toast(on ? '수사 노트에 저장했어요' : '저장을 뺐어요');
}
