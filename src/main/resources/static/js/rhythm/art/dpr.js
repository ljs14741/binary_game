/* 고해상도 대응. 내부 캔버스를 DPR 배로 만들고, 카메라 줌 = DPR, 텍스처는 DPR 배로 굽고 resolution 을 표시해
 * 게임 로직은 계속 540×960 논리 좌표를 쓴다. */
export const DPR = Math.min(2, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
export const BASE_H = 960;
// 논리 크기
export function logical(scene) { return { W: scene.scale.width / DPR, H: scene.scale.height / DPR }; }
// 메뉴 씬: 카메라를 논리 좌표계에 맞춘다
export function setupCamera(scene) {
  const { W, H } = logical(scene);
  scene.cameras.main.setZoom(DPR).centerOn(W / 2, H / 2);
  return { W, H };
}
// scrollFactor(0) 인 HUD 요소의 논리 좌표 → 배치 좌표 (줌이 뷰포트 중심 기준이라 오프셋 필요)
export function hud(scene, lx, ly) {
  const { W, H } = logical(scene);
  return { x: lx + W * (DPR - 1) / 2, y: ly + H * (DPR - 1) / 2 };
}
