// 2장(11/24~) 새 앱: 메일 · 은행 · 캘린더 · 위치 기록 — phone.js가 부른다. 항목 형식은 cases/SPEC.md
import { esc, bar, photo, fmtDay, fmtTime, fmtShortDay, fmtClock, sameDay } from './ui.js?v=202611241048';

export const APP_META2 = {
  mail: { name: '메일', icon: '@', bg: '#7a4fc4', path: 'e' },
  bank: { name: '은행', icon: '₩', bg: '#1f7a3f', path: 'b' },
  calendar: { name: '캘린더', icon: '▤', bg: '#c43a5a', path: 'k' },
  maps: { name: '위치 기록', icon: '⌖', bg: '#2f7fa8', path: 'l' },
};

const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
const pinMark = (s, id) => (s.saved.includes(id) ? ' saved' : '');
const pinBtn = (s, id) => `<button data-pin="${esc(id)}" style="font-size:14px">${s.saved.includes(id) ? '📌 저장됨' : '📌 저장'}</button>`;

// 메일 주소록: 사람 id면 이름·주소, 글자면 그대로
function addr(c, x) {
  const p = c.person.get(x);
  return p ? `${p.name}${p.email ? ` <${p.email}>` : ''}` : String(x);
}
const sender = (c, it) => (it.from ? (c.person.get(it.from)?.name || it.from) : it.sender || '알 수 없음');

// ── 잠금 화면 알림 한 줄 · 수사 노트 한 줄 ─────────────
export function notiText(c, it) {
  if (it.app === 'mail') return [sender(c, it), it.subject];
  if (it.app === 'bank') return [c.bank?.name || '은행', `${it.dir === 'in' ? '입금' : '출금'} ${won(it.amount)} ${it.name || ''}`];
  if (it.app === 'calendar') return ['일정', `${it.title}${it.place ? ` · ${it.place}` : ''}`];
  if (it.app === 'maps') return ['위치 기록', it.place];
  return null;
}
export function pinLine(c, it) {
  if (it.app === 'mail') return `<b>메일</b> · ${esc(sender(c, it))} — ${esc(it.subject)}`;
  if (it.app === 'bank') return `<b>은행</b> · ${it.dir === 'in' ? '입금' : '출금'} ${won(it.amount)} ${esc(it.name || '')}${it.memo ? ` (${esc(it.memo)})` : ''}`;
  if (it.app === 'calendar') return `<b>일정</b> · ${it.deleted ? '[삭제됨] ' : ''}${esc(it.title)}${it.place ? ` @ ${esc(it.place)}` : ''}`;
  if (it.app === 'maps') return `<b>위치</b> · ${esc(it.place)}${it.end ? ` (~${fmtClock(it.end)})` : ''}`;
  return null;
}

// ── 메일 ───────────────────────────────────────
export function mailList(c, s, lv, box, h) {
  box = box === 'sent' ? 'sent' : 'inbox';
  const items = c.items.filter((it) => it.app === 'mail' && (it.box || 'inbox') === box && h.canSee(c, s, it)).sort((a, b) => b.at.localeCompare(a.at));
  const tabs = `<div class="tabs"><button class="${box === 'inbox' ? 'on' : ''}" data-go="#/lv/${lv}/e">받은편지함</button><button class="${box === 'sent' ? 'on' : ''}" data-go="#/lv/${lv}/e/sent">보낸편지함</button></div>`;
  const rows = items.map((it) => {
    const who = box === 'sent' ? `받는 사람: ${(it.to || []).map((x) => c.person.get(x)?.name || x).join(', ')}` : sender(c, it);
    const tags = `${it.fwd ? '<em class="tag">전달</em>' : ''}${it.img ? '<em class="tag">📎</em>' : ''}`;
    return `<button class="mail-row${pinMark(s, it.id)}" data-go="#/lv/${lv}/e/${esc(it.id)}"><div class="top"><b>${esc(who)}</b><time>${fmtShortDay(it.at)} ${fmtClock(it.at)}</time></div><div class="subj">${tags}${esc(it.subject)}</div><div class="snip">${esc((it.text || '').slice(0, 60))}</div></button>`;
  }).join('');
  return bar('메일', `#/lv/${lv}/phone`) + tabs + `<div class="scroll list">${rows || '<p class="pad muted">메일이 없어요.</p>'}</div>`;
}

export function mailView(c, s, lv, id, h) {
  const it = c.byId.get(id);
  if (!it || !h.canSee(c, s, it)) return bar('메일', `#/lv/${lv}/e`) + '<p class="pad muted">볼 수 없는 메일이에요.</p>';
  h.markOpened(c.slug, [id]);
  const back = `#/lv/${lv}/e${it.box === 'sent' ? '/sent' : ''}`;
  const from = it.from ? addr(c, it.from) : `${it.sender || ''}${it.sender_addr ? ` <${it.sender_addr}>` : ''}`;
  const line = (k, v) => (v ? `<div><span>${k}</span>${esc(v)}</div>` : '');
  const att = it.img ? `<button class="mail-att" data-go="#/lv/${lv}/p/${esc(id)}">${photo(it.img, it.alt || '첨부 사진', 'inline-photo', h.base(c))}<span class="small muted">📎 첨부 사진 — 누르면 크게</span></button>` : '';
  return bar('', back, pinBtn(s, id)) + `<div class="scroll"><div class="mail-head"><h3>${it.fwd ? '<em class="tag">전달</em>' : ''}${esc(it.subject)}</h3>
    ${line('보낸 사람', from)}${line('받는 사람', (it.to || []).map((x) => addr(c, x)).join(', '))}${line('참조', (it.cc || []).map((x) => addr(c, x)).join(', '))}
    <div><span>보낸 때</span>${fmtDay(it.at)} ${fmtTime(it.at)}</div></div>
    <div class="note-body" style="font-size:15px">${esc(it.text || '')}</div>${att}</div>`;
}

// ── 은행 ───────────────────────────────────────
export function bank(c, s, lv, h) {
  const items = c.items.filter((it) => it.app === 'bank' && h.canSee(c, s, it)).sort((a, b) => b.at.localeCompare(a.at));
  h.markOpened(c.slug, items.map((i) => i.id));
  const bal = items.find((i) => i.balance != null)?.balance;
  let prev = null;
  const rows = items.map((it) => {
    const day = !prev || !sameDay(prev.at, it.at) ? `<div class="small muted" style="padding:10px 16px 4px">${fmtDay(it.at)}</div>` : '';
    prev = it;
    return `${day}<button class="tx${pinMark(s, it.id)}" data-pin="${esc(it.id)}"><div class="mid"><b>${esc(it.name || '')}</b><div class="small muted">${fmtTime(it.at)} · ${esc(it.kind || (it.dir === 'in' ? '입금' : '출금'))}${it.memo ? ` · 메모 "${esc(it.memo)}"` : ''}</div></div>
      <div class="amt"><b class="${it.dir === 'in' ? 'in' : 'out'}">${it.dir === 'in' ? '+' : '−'}${won(it.amount)}</b>${it.balance != null ? `<div class="small muted">잔액 ${won(it.balance)}</div>` : ''}</div></button>`;
  }).join('');
  const head = `<div class="bank-head"><div class="small">${esc(c.bank?.name || '은행')} · ${esc(c.bank?.account || '')}</div><b>${bal != null ? won(bal) : ''}</b><div class="small">${esc(c.bank?.holder || '')}</div></div>`;
  return bar('은행', `#/lv/${lv}/phone`) + `<div class="scroll">${head}${rows}</div><p class="small muted" style="text-align:center;margin:6px">내역을 누르면 수사 노트에 저장돼요</p>`;
}

// ── 캘린더 ─────────────────────────────────────
export function calendar(c, s, lv, h) {
  const all = c.items.filter((it) => it.app === 'calendar' && h.canSee(c, s, it));
  const live = all.filter((i) => !i.deleted).sort((a, b) => a.at.localeCompare(b.at));
  const gone = all.filter((i) => i.deleted).sort((a, b) => (b.deleted_at || b.at).localeCompare(a.deleted_at || a.at));
  h.markOpened(c.slug, all.map((i) => i.id));
  const today = c.now.slice(0, 10);
  let prev = null;
  const ev = (it) => `<button class="ev${pinMark(s, it.id)}${it.deleted ? ' gone' : ''}" data-pin="${esc(it.id)}"><span class="t">${fmtClock(it.at)}${it.end ? `<br>${fmtClock(it.end)}` : ''}</span><div class="mid"><b>${esc(it.title)}</b>
    <div class="small muted">${[it.deleted && fmtDay(it.at), it.place && esc(it.place), it.repeat && `🔁 ${esc(it.repeat)}`, it.shared_from && `${esc(c.person.get(it.shared_from)?.name || '')} 공유`, it.deleted && `${it.deleted_at ? `${fmtShortDay(it.deleted_at)} ${fmtClock(it.deleted_at)}에 ` : ''}삭제함`].filter(Boolean).join(' · ')}</div>${it.memo ? `<div class="small">${esc(it.memo)}</div>` : ''}</div></button>`;
  const rows = live.map((it) => {
    const d = it.at.slice(0, 10);
    const day = !prev || !sameDay(prev.at, it.at) ? `<div class="cal-day${d === today ? ' today' : ''}">${fmtDay(it.at)}${d === today ? ' · 오늘' : ''}</div>` : '';
    prev = it;
    return day + ev(it);
  }).join('');
  const trash = gone.length ? `<div class="cal-day">최근 삭제한 일정</div>${gone.map(ev).join('')}` : '';
  return bar('캘린더', `#/lv/${lv}/phone`) + `<div class="scroll">${rows || '<p class="pad muted">일정이 없어요.</p>'}${trash}</div>`;
}

// ── 위치 기록 ──────────────────────────────────
export function maps(c, s, lv, day, h) {
  const all = c.items.filter((it) => it.app === 'maps' && h.canSee(c, s, it)).sort((a, b) => a.at.localeCompare(b.at));
  const days = [...new Set(all.map((i) => i.at.slice(0, 10)))].sort().reverse();
  const cur = days.includes(day) ? day : days[0];
  const items = all.filter((i) => i.at.startsWith(cur || '_'));
  h.markOpened(c.slug, items.map((i) => i.id));
  const chips = days.map((d) => `<button class="${d === cur ? 'on' : ''}" data-go="#/lv/${lv}/l/${d}">${fmtShortDay(d + 'T00:00')}</button>`).join('');
  const rows = items.map((it) => it.kind === 'move'
    ? `<button class="loc move${pinMark(s, it.id)}" data-pin="${esc(it.id)}"><span class="t">${fmtClock(it.at)}</span><div class="mid"><span class="small muted">이동 · ${esc(it.place)}${it.end ? ` · ~${fmtClock(it.end)}` : ''}</span></div></button>`
    : `<button class="loc${pinMark(s, it.id)}" data-pin="${esc(it.id)}"><span class="t">${fmtClock(it.at)}${it.end ? `<br>${fmtClock(it.end)}` : ''}</span><div class="mid"><b>📍 ${esc(it.place)}</b>${it.note ? `<div class="small muted">${esc(it.note)}</div>` : ''}</div></button>`).join('');
  return bar('위치 기록', `#/lv/${lv}/phone`) + `<div class="tabs chips">${chips}</div><div class="scroll timeline">${rows || '<p class="pad muted">기록이 없어요.</p>'}</div><p class="small muted" style="text-align:center;margin:6px">기록을 누르면 수사 노트에 저장돼요</p>`;
}
