export default {
  "id": "w1-nails", "world": 1, "title": "판자 뜯기",
  "bpm": 128, "beatsPerBar": 4, "introBars": 2, "outroBars": 1,
  "material": "wood", "lives": 3,
  "hard": { "bpm": 150, "lives": 1 },
  "patterns": [
    { "beats": [0, 1, 2, 3],           "target": "plank-a" },
    { "beats": [0, 0.5, 1, 2],         "target": "plank-a" },
    { "beats": [0, 0.5, 1, 1.5, 2],    "target": "plank-a" },
    { "beats": [0, 1, 1.5, 2, 2.5, 3], "target": "plank-a" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3], "target": "plank-b" },
    { "beats": [0, 0.5, 1, 2, 2.5, 3], "target": "plank-b" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "target": "plank-b" },
    { "beats": [0.5, 1, 1.5, 2.5, 3, 3.5], "target": "plank-b" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "target": "plank-c" },
    { "beats": [0, 1, 1.5, 2, 3, 3.5], "target": "plank-c" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "target": "plank-c" },
    { "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "target": "plank-c" },
    { "beats": [0, 1, 2, 3],           "target": "plank-c" }
  ]
};
