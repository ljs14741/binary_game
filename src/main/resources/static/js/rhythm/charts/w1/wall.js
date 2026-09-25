// 첫 곡이라 느리게, 4분음표 위주로. 8분(촥촥)은 뒤쪽에 살짝만. 옛 채보는 하드모드로 옮김
// windows: 판정 폭(초) 기본보다 넓게. grace: 앞 2패턴은 틀려도 하트 안 깎임
export default {
  "id": "w1-wall", "world": 1, "title": "벽 부수기",
  "bpm": 108, "beatsPerBar": 4, "introBars": 2, "outroBars": 1,
  "material": "brick", "lives": 5, "grace": 2,
  "windows": { "perfect": 0.07, "good": 0.15, "miss": 0.2 },
  "hard": {
    "bpm": 144, "lives": 1, "grace": 0, "windows": null,
    "patterns": [
      { "beats": [0, 1, 2, 3],           "target": "wall-a" },
      { "beats": [0, 1, 2, 3],           "target": "wall-a" },
      { "beats": [0, 2],                 "target": "wall-a" },
      { "beats": [0, 1, 2],              "target": "wall-a" },
      { "beats": [0, 2, 3],              "target": "wall-a" },
      { "beats": [0, 0.5, 1],            "target": "wall-b" },
      { "beats": [0, 1, 2, 2.5, 3],      "target": "wall-b" },
      { "beats": [0, 1.5, 3],            "target": "wall-b" },
      { "beats": [0, 0.5, 2, 2.5],       "target": "wall-b" },
      { "beats": [0, 1, 1.5, 2, 3],      "target": "wall-b" },
      { "beats": [0.5, 1.5, 2.5, 3.5],   "target": "wall-c" },
      { "beats": [0, 0.5, 1, 1.5, 2],    "target": "wall-c" },
      { "beats": [0, 2, 2.5, 3, 3.5],    "target": "wall-c" },
      { "beats": [0, 1, 2, 2.5, 3, 3.5], "target": "wall-c" },
      { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "target": "wall-c" },
      { "beats": [0, 1, 2, 3],           "target": "wall-c" }
    ]
  },
  "patterns": [
    { "beats": [0, 1, 2, 3],           "target": "wall-a" },
    { "beats": [0, 2],                 "target": "wall-a" },
    { "beats": [0, 1, 2, 3],           "target": "wall-a" },
    { "beats": [0, 1, 2],              "target": "wall-a" },
    { "beats": [0, 2, 3],              "target": "wall-a" },
    { "beats": [0, 1, 2, 3],           "target": "wall-b" },
    { "beats": [0, 1, 3],              "target": "wall-b" },
    { "beats": [1, 2, 3],              "target": "wall-b" },
    { "beats": [0, 2],                 "target": "wall-b" },
    { "beats": [0, 1, 2, 3],           "target": "wall-b" },
    { "beats": [0, 2, 2.5],            "target": "wall-c" },
    { "beats": [0, 1, 2, 2.5],         "target": "wall-c" },
    { "beats": [0, 0.5, 2],            "target": "wall-c" },
    { "beats": [0, 1, 2, 3],           "target": "wall-c" }
  ]
};
