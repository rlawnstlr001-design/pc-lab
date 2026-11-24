// 「남의 폰」(가칭) 설정 — 웹 배포·앱 빌드 공통
window.PC_CONFIG = {
  // 판정·기록 서버(트립N빵 공용 프로젝트, 표 접두사 pc_). 비어 있거나 RPC가 아직 없으면 로컬 개발 채점으로만 동작
  supabaseUrl: 'https://nkmkqczahmwqjddzpeqr.supabase.co',
  supabaseKey: 'sb_publishable_EkAloSEEewcCT4qyu6smSQ_gk4kDT_R', // 공개용 키 — 권한은 RPC가 통제
  totalLevels: 1000,
  // 로컬 미리보기에서만 secret.json으로 채점·힌트(배포본에는 secret.json이 없다)
  // 192.168.* = 같은 와이파이의 휴대폰으로 PC 미리보기를 열 때(직접 해보기용)
  dev: ['localhost', '127.0.0.1'].includes(location.hostname) || /^192\.168\./.test(location.hostname),
};
