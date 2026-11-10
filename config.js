// 백엔드(FastAPI) 주소 설정
// - 로컬에서 열면 http://localhost:8000 을 사용
// - Vercel 배포 후에는 RAILWAY_API 를 사용
// 이 파일에는 절대 Supabase 키 같은 비밀 값을 넣지 마세요. (브라우저에 그대로 공개됩니다)
(function () {
  const RAILWAY_API = 'https://my-api-production-5ec4.up.railway.app';

  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  window.APP_CONFIG = Object.freeze({
    API_BASE: isLocal ? 'http://localhost:8000' : RAILWAY_API,
  });
})();
