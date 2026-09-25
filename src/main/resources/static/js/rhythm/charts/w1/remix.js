export default {
  "id": "w1-remix", "world": 1, "title": "리믹스: 집 한 채 통째로",
  "bpm": 126, "beatsPerBar": 4, "introBars": 2, "outroBars": 1,
  "material": "brick", "lives": 3, "grace": 1,
  "hard": { "bpm": 146, "lives": 1, "grace": 0 },
  "patterns": [
    { "beats": [0, 1, 2, 3],           "target": "wall",    "material": "brick" },
    { "beats": [0, 0.5, 2, 2.5],       "target": "window",  "material": "glass" },
    { "beats": [0.5, 1.5, 2.5, 3.5],   "target": "chimney", "material": "brick" },
    { "beats": [0, 0.5, 1, 1.5, 2],    "target": "plank",   "material": "wood" },
    { "beats": [0, 1, 1.5, 2, 3],      "target": "wall",    "material": "brick" },
    { "beats": [0, 0.5, 1, 2, 2.5],    "target": "window",  "material": "glass" },
    { "beats": [0, 1.5, 2, 3.5],       "target": "chimney", "material": "brick" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3], "target": "plank", "material": "wood" },
    { "beats": [0, 0.5, 2, 2.5, 3, 3.5], "target": "wall",  "material": "brick" },
    { "beats": [0.5, 1, 2.5, 3],       "target": "window",  "material": "glass" },
    { "beats": [0.5, 1.5, 2, 3, 3.5],  "target": "chimney", "material": "brick" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "target": "plank", "material": "wood" },
    { "beats": [0, 1, 2, 3],           "target": "wall",    "material": "brick" }
  ]
};
