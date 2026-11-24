// 화면 공통 도구
export const $app = () => document.getElementById('app');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const go = (hash) => { location.hash = hash; };

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function parts(at) {
  const [d, t] = at.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return { y, m, d: dd, hh, mm, wd: WD[new Date(y, m - 1, dd).getDay()] };
}
export const fmtDay = (at) => { const p = parts(at); return `${p.y}년 ${p.m}월 ${p.d}일 (${p.wd})`; };
export const fmtShortDay = (at) => { const p = parts(at); return `${p.m}/${p.d}`; };
export const fmtTime = (at) => { const p = parts(at); const pm = p.hh >= 12; const h = p.hh % 12 || 12; return `${pm ? '오후' : '오전'} ${h}:${String(p.mm).padStart(2, '0')}`; };
export const fmtClock = (at) => { const p = parts(at); return `${p.hh}:${String(p.mm).padStart(2, '0')}`; };
export const fmtLockDate = (at) => { const p = parts(at); return `${p.m}월 ${p.d}일 ${p.wd}요일`; };
export const sameDay = (a, b) => a.slice(0, 10) === b.slice(0, 10);
export const fmtDur = (s) => (s ? (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`) : '연결 안 됨');

export function avatar(p) {
  const name = p?.short || p?.name || '?';
  return `<span class="avatar" style="background:${esc(p?.color || '#777')}">${esc(name.slice(0, 1))}</span>`;
}

// 사진: 파일이 아직 없으면(제작 중) 설명 글로 대신 보여 준다
export function photo(src, alt, cls = 'thumb', base = '') {
  const url = src ? `${base}${src}` : '';
  return `<div class="${cls}" role="img" aria-label="${esc(alt)}">
    <span class="ph">🖼 ${esc(alt)}</span>
    ${url ? `<img src="${esc(url)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${cls === 'img' ? 'contain' : 'cover'}" onerror="this.remove()">` : ''}
  </div>`;
}

export function bar(title, back, right = '') {
  return `<header class="bar"><button class="back" data-go="${esc(back)}" aria-label="뒤로">‹</button><h2>${esc(title)}</h2>${right}</header>`;
}
