/* 소스의 `import Phaser from 'phaser'` 를 빌드 없이 그대로 쓰기 위한 다리.
 * rhythm.html 의 import map 이 'phaser' 를 이 파일로 보내고, 실제 라이브러리는 /js/phaser-3.90.min.js 가 전역으로 올려둔다. */
export default window.Phaser;
