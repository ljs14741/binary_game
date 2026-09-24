/* 고해상도 대응 (리듬게임과 같은 방식). 캔버스를 DPR 배로 만들고 카메라 줌 = DPR,
 * 텍스처도 DPR 배로 구워서 게임 로직은 계속 논리 좌표(세로 960)를 씀. */
export const DPR = Math.min(2, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
export const BASE_H = 960;
// 파티클은 텍스처 해상도를 반영 못 해서 크기(scale)에 이걸 곱해야 논리 크기가 맞음
export const PS = 1 / DPR;
export function logical(scene) { return { W: scene.scale.width / DPR, H: scene.scale.height / DPR }; }
export function setupCamera(scene) {
  const { W, H } = logical(scene);
  scene.cameras.main.setZoom(DPR).centerOn(W / 2, H / 2);
  return { W, H };
}
