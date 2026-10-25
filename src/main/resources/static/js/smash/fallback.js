// 지도 없이 시작할 때(가상 회사, 또는 지도 서버가 응답하지 않을 때) 쓰는 가상의 동네.
// 서버 /api/smash/area 응답과 같은 모양(미터, x 동쪽 z 남쪽)을 만든다.
export function fakeArea(seed = 7) {
    let a = seed;
    const rnd = () => {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const buildings = [], roads = [], areas = [];
    const BLOCK = 76, ROAD = 14, R = 260;
    const rect = (cx, cz, w, d) => [cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2, cx + w / 2, cz - d / 2, cx - w / 2, cz - d / 2];
    // 대상 사옥은 원점
    buildings.push({ id: 'w-target', name: null, kind: 'office', h: 46, lv: 14, poly: rect(0, 0, 34, 22) });
    for (let gx = -4; gx <= 4; gx++) {
        for (let gz = -4; gz <= 4; gz++) {
            const cx = gx * (BLOCK + ROAD), cz = gz * (BLOCK + ROAD);
            if (Math.hypot(cx, cz) > R + 40) continue;
            if (gx === 0 && gz === 0) {
                areas.push({ t: 'park', poly: rect(26, 26, 22, 18) });
                continue;
            }
            if (rnd() < 0.12) { areas.push({ t: 'park', poly: rect(cx, cz, BLOCK - 6, BLOCK - 6) }); continue; }
            const n = 2 + Math.floor(rnd() * 3);
            const cell = BLOCK / n;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                if (rnd() < 0.15) continue;
                const w = cell * (0.55 + rnd() * 0.35), d = cell * (0.55 + rnd() * 0.35);
                const x = cx - BLOCK / 2 + cell * (i + 0.5), z = cz - BLOCK / 2 + cell * (j + 0.5);
                const tall = Math.hypot(x, z) < 140 && rnd() < 0.35;
                const h = tall ? 30 + rnd() * 50 : 8 + rnd() * 22;
                buildings.push({ id: `w-${gx}-${gz}-${i}-${j}`, name: null, kind: 'yes', h, lv: 0, poly: rect(x, z, w, d) });
            }
        }
    }
    for (let g = -4; g <= 4; g++) {
        const c = g * (BLOCK + ROAD) + (BLOCK + ROAD) / 2;
        const t = g % 2 === 0 ? 'major' : 'minor';
        const w = t === 'major' ? 16 : 9;
        roads.push({ t, w, pts: [-R - 40, c, R + 40, c] });
        roads.push({ t, w, pts: [c, -R - 40, c, R + 40] });
    }
    return { lat: 0, lng: 0, radius: R, buildings, roads, areas, fake: true };
}
