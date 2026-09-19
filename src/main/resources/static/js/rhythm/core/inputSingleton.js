import { Input } from './input.js';
import { AudioEngine } from './audio.js';
// 키는 문서 전체에서, 포인터는 게임 박스 안에서만 (페이지에 다른 요소가 같이 있다)
export const input = new Input(AudioEngine, document, document.getElementById('bw-rhythm-stage'));
input.enabled = false;
input.attach();
