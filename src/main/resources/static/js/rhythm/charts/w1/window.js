export default {
  "id": "w1-window", "world": 1, "title": "창문 깨기",
  "bpm": 124, "beatsPerBar": 4, "introBars": 2, "outroBars": 1,
  "material": "glass", "lives": 3,
  "hard": { "bpm": 148, "lives": 1 },
  "patterns": [
    { "beats": [0, 2],                 "target": "win-a" },
    { "beats": [0, 0.5, 2],            "target": "win-a" },
    { "beats": [0, 0.5, 2, 2.5],       "target": "win-a" },
    { "beats": [0, 1, 1.5, 3],         "target": "win-a" },
    { "beats": [0, 0.5, 1, 2],         "target": "win-b" },
    { "beats": [0, 0.5, 2, 2.5, 3],    "target": "win-b" },
    { "beats": [0, 1, 1.5, 2, 2.5],    "target": "win-b" },
    { "beats": [0.5, 1, 2.5, 3],       "target": "win-b" },
    { "beats": [0, 0.5, 1, 1.5, 3],    "target": "win-c" },
    { "beats": [0, 0.5, 2, 2.5, 3, 3.5], "target": "win-c" },
    { "beats": [0, 1, 1.5, 2, 2.5, 3], "target": "win-c" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3], "target": "win-c" },
    { "beats": [0, 0.5, 2, 2.5],       "target": "win-c" },
    { "beats": [0, 1, 2, 3],           "target": "win-c" }
  ]
};
