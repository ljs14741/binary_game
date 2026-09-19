export default {
  "id": "w1-wall", "world": 1, "title": "벽 부수기",
  "bpm": 120, "beatsPerBar": 4, "introBars": 2, "outroBars": 1,
  "material": "brick", "lives": 3,
  "hard": { "bpm": 144, "lives": 1 },
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
};
