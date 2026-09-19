/* share.js — 페이지 하단 공유 버튼. 다른 게임 페이지(press.js 등)와 같은 형식.
 * 게임 소스가 아니라 사이트 쪽 코드라 여기에만 따로 둔다. */
const SHARE_URL = 'https://game.binaryworld.kr/rhythm';
const SHARE_TITLE = '뿌셔뿌셔 리듬게임';
const SHARE_DESC = '리듬을 듣고 똑같이 따라 쳐서 벽·창문·굴뚝을 부순다. 버튼 하나, 설치 없음!';

window.shareTwitter = function shareTwitter() {
  window.open('https://twitter.com/intent/tweet?text=' +
    encodeURIComponent(SHARE_TITLE + ' - 박자에 맞춰 다 부수는 무료 리듬게임') +
    '&url=' + encodeURIComponent(SHARE_URL));
};
window.shareFacebook = function shareFacebook() {
  window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(SHARE_URL));
};
function setupKakaoShareButton() {
  if (!window.Kakao || !document.querySelector('#btnKakao')) return;
  if (!Kakao.isInitialized()) Kakao.init('8b68c737be6b8e9a8007c61ee6f9b8da');
  Kakao.Share.createDefaultButton({
    container: '#btnKakao',
    objectType: 'feed',
    content: {
      title: SHARE_TITLE,
      description: SHARE_DESC,
      imageUrl: 'https://game.binaryworld.kr/img/rhythm.png',
      link: { mobileWebUrl: SHARE_URL, webUrl: SHARE_URL }
    }
  });
}
try { setupKakaoShareButton(); } catch (e) { /* 카카오 SDK 가 없거나 막힌 환경 */ }
