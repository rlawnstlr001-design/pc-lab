// 「남의 폰」(가칭) — 라우팅 · 레벨 지도 · 브리핑 · 지목 · 결과
// #/ 지도 · #/lv/N 브리핑 · #/lv/N/phone|m|g|p|n|c|pins 폰 · #/lv/N/accuse 지목 · #/lv/N/result 결과
import { $app, esc, go, toast } from './ui.js';
import { loadLevels, loadCase, loadSecretDev, progress, rpc, track, startPlay } from './store.js';
import { renderPhone, togglePin } from './phone.js';

const CFG = window.PC_CONFIG || {};
const TIER = { mini: '3~5분', short: '약 10분', main: '보스 · 30분' };
let LEVELS = [];

function parse() {
  const h = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (h[0] !== 'lv') return { page: 'map' };
  return { page: 'lv', lv: Number(h[1]), view: h[2] || 'brief', arg: h.slice(3).join('/') || null };
}
const unlockedUpTo = () => {
  const cleared = progress.get().cleared;
  if (CFG.dev && location.search.includes('all')) return LEVELS.length;
  let n = 1;
  while (n < LEVELS.length && cleared[LEVELS[n - 1]]) n++;
  return n;
};

// ── 레벨 지도 ─────────────────────────────────
async function map() {
  const cleared = progress.get().cleared;
  const cases = await Promise.all(LEVELS.map((s) => loadCase(s).catch(() => null)));
  const open = unlockedUpTo();
  const done = LEVELS.filter((s) => cleared[s]).length;
  const rows = cases.map((c, i) => {
    const lv = i + 1, slug = LEVELS[i];
    if (!c) return '';
    const boss = c.tier === 'main';
    const st = cleared[slug] ? '깸 ✓' : lv <= open ? '도전' : '🔒';
    const cls = `level${boss ? ' boss' : ''}${cleared[slug] ? ' done' : ''}${lv > open ? ' locked' : ''}`;
    return `<li><button class="${cls}" ${lv <= open ? `data-go="#/lv/${lv}"` : 'disabled'}><span class="no">Lv ${lv}</span><span class="t"><b>${lv <= open ? esc(c.title) : '???'}</b><span class="st">${TIER[c.tier || 'main']}</span></span><span class="st">${st}</span></button></li>`;
  }).join('');
  const more = `<li><div class="level locked"><span class="no">Lv ${LEVELS.length + 1}</span><span class="t"><b>다음 사건 준비 중</b><span class="st">열리면 알려 드릴게요</span></span></div></li>`;
  $app().innerHTML = `<div class="scroll"><div class="map-head"><div class="small muted">남의 폰 — 남의 휴대폰으로 진실을 맞혀라</div><h1>Lv ${Math.min(open, LEVELS.length)} <span class="muted" style="font-size:16px">/ ${CFG.totalLevels || 1000}</span></h1>
    <div class="progress"><i style="width:${Math.max(1, (done / (CFG.totalLevels || 1000)) * 100)}%"></i></div><p class="small muted">깬 사건 ${done}개</p></div>
    <ul class="levels">${rows}${more}</ul></div>`;
}

// ── 브리핑 ───────────────────────────────────
function brief(c, lv) {
  const s = progress.caseState(c.slug);
  const started = s.startedAt;
  $app().innerHTML = `<header class="bar"><button class="back" data-go="#/" aria-label="레벨 지도">‹</button><h2>Lv ${lv}</h2></header>
    <div class="brief"><div class="role">${esc(c.player_role)}</div><h1>${esc(c.title)}</h1>
    ${c.brief.map((b) => `<p>${esc(b)}</p>`).join('')}
    <p class="small muted">예상 ${c.est_minutes}분 · 질문 ${c.questions.length}개</p><div class="spacer"></div>
    <button class="btn" data-go="#/lv/${lv}/phone">${started ? '폰 다시 열기' : '폰 열기'}</button>
    ${started ? `<button class="btn ghost" data-reset="${esc(c.slug)}">처음부터 다시</button>` : ''}</div>`;
}

// ── 지목 ────────────────────────────────────
function accuse(c, lv) {
  const s = progress.caseState(c.slug);
  const qs = c.questions.map((q, i) => `<fieldset class="q"><h3>${i + 1}. ${esc(q.prompt)}</h3>${q.options.map((o) =>
    `<label class="opt"><input type="radio" name="${esc(q.id)}" value="${esc(o.id)}"><span>${esc(o.label)}</span></label>`).join('')}</fieldset>`).join('');
  $app().innerHTML = `<header class="bar"><button class="back" data-go="#/lv/${lv}/phone">‹</button><h2>진실 맞히기</h2></header>
    <form class="scroll pad" id="accuse">${qs}<p class="small muted">${s.attempts ? '마지막 기회예요.' : '틀려도 한 번 더 도전할 수 있어요.'}</p><button class="btn" type="submit">제출</button></form>`;
  document.getElementById('accuse').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const answers = Object.fromEntries(c.questions.map((q) => [q.id, fd.get(q.id)]));
    if (Object.values(answers).some((v) => !v)) { toast('모든 질문에 답해 주세요'); return; }
    const graded = await grade(c, answers);
    if (!graded) { toast('채점 서버가 아직 준비 중이에요'); return; }
    const st = progress.update(c.slug, (x) => { x.attempts = (x.attempts || 0) + 1; x.last = { answers, ...graded, at: Date.now() }; });
    if (graded.solved) progress.clear(c.slug, { right: graded.right, total: c.questions.length, seconds: Math.round((Date.now() - (st.startedAt || Date.now())) / 1000), attempts: st.attempts });
    go(`#/lv/${lv}/result`);
  });
}

// 채점: 정식은 서버 RPC(pc_submit), 로컬 미리보기는 secret.json
async function grade(c, answers) {
  const sec = await loadSecretDev(c.slug);
  if (!sec) {
    let playId = progress.caseState(c.slug).playId || await startPlay(c.slug);
    const r = playId ? await rpc('pc_submit', { p_play: playId, p_answers: answers }) : null;
    if (r && r.error === 'no_attempts') {                    // 처음부터 다시 풀기 등으로 play가 끝난 경우 새로 시작
      playId = await startPlay(c.slug);
      return playId ? rpc('pc_submit', { p_play: playId, p_answers: answers }) : null;
    }
    return r && !r.error ? r : null;
  }
  const right = c.questions.filter((q) => sec.answers[q.id] === answers[q.id]).map((q) => q.id);
  const who = c.questions.find((q) => q.kind === 'who')?.id;
  const need = c.questions.length >= 5 ? c.questions.length - 1 : c.questions.length;
  return { right: right.length, rightIds: right, solved: right.includes(who) && right.length >= need, explanation: sec.explanation, answerKey: sec.answers };
}

// ── 결과 ────────────────────────────────────
// 해설 속 항목 번호(m20, g4, c3·c4 …)는 화면에 안 보이니 읽을 수 있는 말로 바꾼다
function readable(c, text) {
  const label = (id) => {
    const it = c.byId.get(id);
    if (!it) return '';
    const when = `${Number(it.at.slice(5, 7))}/${Number(it.at.slice(8, 10))} ${it.at.slice(11, 16)}`;
    if (it.app === 'messenger') return it.deleted ? `${when} 지운 메시지` : it.img ? `${when}에 받은 사진` : `${when} 메시지`;
    if (it.app === 'gallery') return `${when} 사진`;
    if (it.app === 'notes') return `메모 「${it.title}」`;
    if (it.app === 'calls') return `${when} 통화 기록`;
    return '';
  };
  return String(text || '')
    .replace(/\s?\(((?:[mgnc]\d+)(?:\s*[·,·/]\s*[mgnc]?\d+)*)\)/g, '')   // 괄호 속 번호 묶음은 지운다
    .replace(/([mgnc]\d+)/g, (m, id) => label(id) || m);              // 문장 속 번호는 말로
}

function result(c, lv) {
  const s = progress.caseState(c.slug);
  const r = s.last;
  if (!r) { go(`#/lv/${lv}`); return; }
  const cleared = progress.get().cleared[c.slug];
  const canRetry = !r.solved && (s.attempts || 0) < 2;
  const mins = cleared ? `${Math.floor(cleared.seconds / 60)}분 ${cleared.seconds % 60}초` : '';
  const showExp = r.solved || !canRetry;
  const exp = showExp ? c.questions.map((q, i) => {
    const ok = r.rightIds.includes(q.id);
    const ans = q.options.find((o) => o.id === r.answerKey[q.id])?.label;
    return `<div class="exp"><b class="${ok ? 'ok' : 'ng'}">${ok ? '✓' : '✗'} ${i + 1}. ${esc(q.prompt)}</b><div class="small">정답: ${esc(ans)}</div><p style="margin:6px 0 0">${esc(readable(c, r.explanation?.[q.id]))}</p></div>`;
  }).join('') : '';
  const next = LEVELS[lv] ? `<button class="btn" data-go="#/lv/${lv + 1}">다음 레벨 Lv ${lv + 1}</button>` : `<button class="btn" data-notify="1">다음 사건 열리면 알림 받기</button>`;
  $app().innerHTML = `<header class="bar"><button class="back" data-go="#/">‹</button><h2>Lv ${lv} 결과</h2></header>
    <div class="scroll pad"><div class="result-card">
      <div class="big">${r.solved ? '사건 해결' : '아직 아니에요'}</div>
      <p>${c.questions.length}문항 중 ${r.right}개${mins ? ` · ${mins}` : ''}</p></div>
      ${r.solved ? next + `<button class="btn ghost" data-share="${lv}">결과 공유하기</button>` : canRetry ? `<button class="btn" data-go="#/lv/${lv}/phone">폰 다시 보기</button><button class="btn ghost" data-go="#/lv/${lv}/accuse">다시 지목하기</button>` : `<button class="btn ghost" data-reset="${esc(c.slug)}">처음부터 다시 풀기</button>`}
      ${showExp ? `<h3 style="margin:22px 0 4px">해설</h3>${exp}` : ''}
      <button class="btn ghost" data-pay="1" style="margin-top:18px">다음 사건 묶음, 2,900원이면 사겠어요</button>
    </div>`;
}

// 결과 공유(스포일러 없음) — 결과 카드 그림은 2주차
async function share(lv) {
  const slug = LEVELS[lv - 1];
  const done = progress.get().cleared[slug];
  const c = await loadCase(slug);
  const t = done ? `${Math.floor(done.seconds / 60)}분 ${done.seconds % 60}초` : '';
  const text = `남의 폰 Lv ${lv} 「${c.title}」 해결 — ${done?.right}/${done?.total}문항${t ? ` · ${t}` : ''}
남의 휴대폰으로 진실을 맞혀 보세요`;
  const url = location.origin + location.pathname;
  track(slug, 'share');
  try {
    if (navigator.share) await navigator.share({ text, url });
    else { await navigator.clipboard.writeText(`${text}
${url}`); toast('복사했어요'); }
  } catch { /* 공유 취소 */ }
}

// ── 라우터 ───────────────────────────────────
async function render() {
  const r = parse();
  try {
    if (r.page === 'map') return await map();
    const slug = LEVELS[r.lv - 1];
    if (!slug || r.lv > unlockedUpTo()) { go('#/'); return; }
    const c = await loadCase(slug);
    if (r.view === 'brief') return brief(c, r.lv);
    if (r.view === 'accuse') return accuse(c, r.lv);
    if (r.view === 'result') return result(c, r.lv);
    $app().innerHTML = renderPhone(c, r.lv, r.view === 'phone' ? null : r.view, r.arg);
    const chat = document.getElementById('chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  } catch (err) {
    $app().innerHTML = `<div class="pad"><p>문제가 생겼어요: ${esc(err.message)}</p><button class="btn" data-go="#/">레벨 지도로</button></div>`;
  }
}

document.addEventListener('click', async (e) => {
  const peeking = e.target.closest('.lock.peek');
  if (peeking) { peeking.classList.remove('peek'); const b = peeking.querySelector('[data-peek]'); if (b) b.textContent = '배경 보기'; return; }
  const pk = e.target.closest('[data-peek]');
  if (pk) { const l = document.querySelector('.lock'); l.classList.toggle('peek'); pk.textContent = l.classList.contains('peek') ? '돌아가기' : '배경 보기'; return; }
  const el = e.target.closest('[data-go],[data-pin],[data-photo],[data-reset],[data-pay],[data-notify],[data-share]');
  if (!el) return;
  const r = parse();
  if (el.dataset.go) { go(el.dataset.go); return; }
  if (el.dataset.photo) { go(`#/lv/${r.lv}/p/${el.dataset.photo}`); return; }
  if (el.dataset.pin) { togglePin(LEVELS[r.lv - 1], el.dataset.pin); render(); return; }
  if (el.dataset.reset) { if (confirm('이 사건을 처음부터 다시 풀까요? 저장한 단서도 지워져요.')) { progress.reset(el.dataset.reset); go(`#/lv/${r.lv}`); render(); } return; }
  if (el.dataset.share) { share(el.dataset.share); return; }
  if (el.dataset.pay) { track(LEVELS[r.lv - 1], 'would_pay_click'); toast('아직 준비 중이에요. 열리면 알려 드릴게요'); return; }
  if (el.dataset.notify) { track(LEVELS[r.lv - 1], 'notify_click'); toast('고마워요! 다음 사건이 열리면 첫 화면에 알려 드릴게요'); }
});
window.addEventListener('hashchange', render);

LEVELS = await loadLevels();
render();
