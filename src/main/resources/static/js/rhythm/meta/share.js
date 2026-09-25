/* 기록 공유. 폰은 공유 시트, PC 는 클립보드 복사. 결과: 'shared' | 'copied' | null */
export function shareText(text) {
  const url = location.origin + location.pathname;
  if (navigator.share) return navigator.share({ title: document.title, text, url }).then(() => 'shared', () => null);
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text + '\n' + url).then(() => 'copied', () => null);
  return Promise.resolve(null);
}
