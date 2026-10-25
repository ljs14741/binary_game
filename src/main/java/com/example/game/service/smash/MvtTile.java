package com.example.game.service.smash;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Mapbox 벡터 타일(.pbf) 최소 해석기. 필요한 것만 읽는다: 레이어 이름, 피처 id·속성·도형.
 * 도형은 타일 좌표(0..extent, y 아래쪽)의 고리/선 목록으로 돌려준다.
 */
public final class MvtTile {

    public static final int POINT = 1, LINE = 2, POLYGON = 3;

    public record Feature(long id, int type, Map<String, Object> tags, List<int[]> parts) {
        public String str(String k) {
            Object v = tags.get(k);
            return v == null ? null : v.toString();
        }

        public double num(String k, double def) {
            Object v = tags.get(k);
            return v instanceof Number n ? n.doubleValue() : def;
        }
    }

    public record Layer(String name, int extent, List<Feature> features) {
    }

    private MvtTile() {
    }

    public static Map<String, Layer> decode(byte[] buf) {
        Map<String, Layer> out = new HashMap<>();
        Reader r = new Reader(buf, 0, buf.length);
        while (r.more()) {
            int tag = r.varint32();
            if ((tag >>> 3) == 3 && (tag & 7) == 2) {
                int len = r.varint32();
                Layer l = layer(new Reader(buf, r.pos, r.pos + len));
                out.put(l.name, l);
                r.pos += len;
            } else r.skip(tag & 7);
        }
        return out;
    }

    private static Layer layer(Reader r) {
        String name = "";
        int extent = 4096;
        List<String> keys = new ArrayList<>();
        List<Object> values = new ArrayList<>();
        List<int[]> rawFeatures = new ArrayList<>();
        while (r.more()) {
            int tag = r.varint32();
            int field = tag >>> 3, wire = tag & 7;
            if (field == 1 && wire == 2) name = r.string();
            else if (field == 2 && wire == 2) {
                int len = r.varint32();
                rawFeatures.add(new int[]{r.pos, r.pos + len});
                r.pos += len;
            } else if (field == 3 && wire == 2) keys.add(r.string());
            else if (field == 4 && wire == 2) {
                int len = r.varint32();
                values.add(value(new Reader(r.buf, r.pos, r.pos + len)));
                r.pos += len;
            } else if (field == 5 && wire == 0) extent = r.varint32();
            else r.skip(wire);
        }
        List<Feature> features = new ArrayList<>(rawFeatures.size());
        for (int[] f : rawFeatures) features.add(feature(new Reader(r.buf, f[0], f[1]), keys, values));
        return new Layer(name, extent, features);
    }

    private static Object value(Reader r) {
        Object v = null;
        while (r.more()) {
            int tag = r.varint32();
            switch (tag >>> 3) {
                case 1 -> v = r.string();
                case 2 -> v = (double) Float.intBitsToFloat(r.fixed32());
                case 3 -> v = Double.longBitsToDouble(r.fixed64());
                case 4, 5 -> v = r.varint64();
                case 6 -> {
                    long z = r.varint64();
                    v = (z >>> 1) ^ -(z & 1);
                }
                case 7 -> v = r.varint64() != 0;
                default -> r.skip(tag & 7);
            }
        }
        return v;
    }

    private static Feature feature(Reader r, List<String> keys, List<Object> values) {
        long id = 0;
        int type = 0;
        Map<String, Object> tags = new HashMap<>();
        int[] geom = new int[0];
        while (r.more()) {
            int tag = r.varint32();
            int field = tag >>> 3, wire = tag & 7;
            if (field == 1 && wire == 0) id = r.varint64();
            else if (field == 2 && wire == 2) {
                int len = r.varint32();
                int end = r.pos + len;
                while (r.pos < end) {
                    int k = r.varint32(), v = r.varint32();
                    if (k < keys.size() && v < values.size()) tags.put(keys.get(k), values.get(v));
                }
            } else if (field == 3 && wire == 0) type = r.varint32();
            else if (field == 4 && wire == 2) {
                int len = r.varint32();
                int end = r.pos + len;
                List<Integer> g = new ArrayList<>();
                while (r.pos < end) g.add(r.varint32());
                geom = g.stream().mapToInt(Integer::intValue).toArray();
            } else r.skip(wire);
        }
        return new Feature(id, type, tags, geometry(geom, type));
    }

    /** 명령 스트림 → 고리/선 목록 [x0,y0,x1,y1,...]. 다각형 고리는 닫는 점 없이 */
    static List<int[]> geometry(int[] g, int type) {
        List<int[]> parts = new ArrayList<>();
        List<Integer> cur = null;
        int x = 0, y = 0, i = 0;
        while (i < g.length) {
            int cmd = g[i] & 7, count = g[i] >>> 3;
            i++;
            if (cmd == 1 || cmd == 2) {
                for (int k = 0; k < count && i + 1 < g.length; k++) {
                    x += zigzag(g[i++]);
                    y += zigzag(g[i++]);
                    if (type == POINT) {
                        parts.add(new int[]{x, y});
                        continue;
                    }
                    if (cmd == 1) {
                        if (cur != null && cur.size() >= 4) parts.add(toArray(cur));
                        cur = new ArrayList<>();
                    }
                    if (cur != null) { cur.add(x); cur.add(y); }
                }
            } else if (cmd == 7) {
                if (cur != null && cur.size() >= 6) parts.add(toArray(cur));
                cur = null;
            }
        }
        if (cur != null && cur.size() >= 4 && type != POLYGON) parts.add(toArray(cur));
        return parts;
    }

    private static int zigzag(int n) {
        return (n >>> 1) ^ -(n & 1);
    }

    private static int[] toArray(List<Integer> l) {
        int[] a = new int[l.size()];
        for (int i = 0; i < a.length; i++) a[i] = l.get(i);
        return a;
    }

    /** 타일 좌표 고리의 신발끈 면적. MVT 규칙상 바깥 고리 > 0, 구멍 < 0 (y 아래쪽 좌표) */
    static long ringArea(int[] r) {
        long a = 0;
        int n = r.length / 2;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            a += (long) r[i * 2] * r[j * 2 + 1] - (long) r[j * 2] * r[i * 2 + 1];
        }
        return a;
    }

    private static final class Reader {
        final byte[] buf;
        int pos;
        final int end;

        Reader(byte[] buf, int pos, int end) {
            this.buf = buf;
            this.pos = pos;
            this.end = end;
        }

        boolean more() {
            return pos < end;
        }

        int varint32() {
            return (int) varint64();
        }

        long varint64() {
            long v = 0;
            int shift = 0;
            while (pos < end) {
                byte b = buf[pos++];
                v |= (long) (b & 0x7f) << shift;
                if ((b & 0x80) == 0) break;
                shift += 7;
            }
            return v;
        }

        int fixed32() {
            int v = (buf[pos] & 0xff) | (buf[pos + 1] & 0xff) << 8 | (buf[pos + 2] & 0xff) << 16 | (buf[pos + 3] & 0xff) << 24;
            pos += 4;
            return v;
        }

        long fixed64() {
            long lo = fixed32() & 0xffffffffL;
            long hi = fixed32() & 0xffffffffL;
            return hi << 32 | lo;
        }

        String string() {
            int len = varint32();
            String s = new String(buf, pos, len, java.nio.charset.StandardCharsets.UTF_8);
            pos += len;
            return s;
        }

        void skip(int wire) {
            switch (wire) {
                case 0 -> varint64();
                case 1 -> pos += 8;
                case 2 -> pos += varint32();
                case 5 -> pos += 4;
                default -> pos = end;
            }
        }
    }
}
