// 데이터 불러오기 · 진행 저장 · 잠금 해시
const CFG = window.PC_CONFIG || {};
const KEY = 'pc_progress';
const cache = new Map();

// 장(10레벨 묶음) 목록 — 스테이지 지도용(cases/chapters.json)
export async function loadChapters() {
  try { const r = await fetch('cases/chapters.json?v=dev'); if (r.ok) return await r.json(); } catch { /* 기본값 */ }
  return [];
}
export async function loadLevels() {
  try {
    const r = await fetch('cases/levels.json?v=dev');
    if (r.ok) return await r.json();
  } catch { /* 없으면 아래 기본값 */ }
  return ['001'];
}

export async function loadCase(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const r = await fetch(`cases/${slug}/case.json?v=dev`);
  if (!r.ok) throw new Error(`사건 ${slug}을 불러오지 못했어요`);
  const c = await r.json();
  c.byId = new Map(c.items.map((it) => [it.id, it]));
  c.people = c.people || [];
  c.person = new Map(c.people.map((p) => [p.id, p]));
  cache.set(slug, c);
  return c;
}

// 개발 미리보기 전용 — 배포본에는 secret.json이 없어 null
export async function loadSecretDev(slug) {
  if (!CFG.dev) return null;
  try { const r = await fetch(`cases/${slug}/secret.json`); return r.ok ? await r.json() : null; } catch { return null; }
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const checkCode = async (slug, lockId, code, hash) => (await sha256(`${slug}:${lockId}:${code}`)) === hash;

const empty = () => ({ unlocked: [], opened: [], saved: [], tries: {}, startedAt: null, attempts: 0 });
function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { cleared: {}, cases: {} }; } catch { return { cleared: {}, cases: {} }; }
}
function write(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 저장 못 해도 진행은 됨 */ } }

export const progress = {
  get: read,
  caseState(slug) { return read().cases[slug] || empty(); },
  update(slug, fn) {
    const p = read();
    const s = p.cases[slug] || empty();
    fn(s);
    p.cases[slug] = s;
    write(p);
    return s;
  },
  clear(slug, info) { const p = read(); p.cleared[slug] = { ...info, at: Date.now() }; write(p); },
  reset(slug) { const p = read(); delete p.cases[slug]; write(p); },
};

// ── 서버(RPC) — 실패해도 게임은 계속된다 ─────────────────────
export function device() {
  try {
    let id = localStorage.getItem('pc_device');
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('pc_device', id); }
    return id;
  } catch { return 'nodevice-' + Date.now(); }
}
export async function rpc(fn, body) {
  if (!CFG.supabaseUrl) return null;
  try {
    const r = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST', keepalive: true,
      headers: { apikey: CFG.supabaseKey, Authorization: `Bearer ${CFG.supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
export const track = (slug, name, meta = null) => { rpc('pc_event', { p_device: device(), p_slug: slug, p_name: name, p_meta: meta }); };
export async function startPlay(slug) {
  const id = await rpc('pc_start', { p_slug: slug, p_device: device() });
  if (id) progress.update(slug, (s) => { s.playId = id; });
  return id;
}
