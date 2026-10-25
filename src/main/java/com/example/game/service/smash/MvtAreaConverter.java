package com.example.game.service.smash;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenMapTiles 스키마 벡터 타일(OpenFreeMap) → 게임 지도 데이터.
 * 좌표는 OsmConverter 와 같다: 요청 중심에서의 미터, x 동쪽 z 남쪽.
 *
 * <p>건물 이름은 타일에 없다. 회사 건물은 검색 좌표가 든 건물로 고른다 (게임 쪽).
 * hide_3d 가 붙은 건물은 여러 조각(building:part)으로 나뉜 건물의 바깥 윤곽이다.
 * 조각 대신 윤곽 하나를 쓴다 — 조각을 쓰면 회사 건물이 쪼가리 하나로 잡힌다.
 */
public final class MvtAreaConverter {

    private MvtAreaConverter() {
    }

    public record TileData(int z, int x, int y, Map<String, MvtTile.Layer> layers) {
    }

    /** 간판으로 달 만한 가게 종류 (OpenMapTiles poi class) */
    private static final java.util.Set<String> SHOP_CLASSES = java.util.Set.of(
            "cafe", "restaurant", "fast_food", "bakery", "bank", "shop", "grocery", "pharmacy", "hospital",
            "doctors", "dentist", "post", "lodging", "cinema", "office", "bar", "beer", "ice_cream", "clothing_store", "library", "police", "town_hall");

    /** 타일 경계 근처 표시물은 양쪽 타일에 다 들어 있다 */
    private static List<OsmConverter.Poi> dedupePois(List<OsmConverter.Poi> in) {
        List<OsmConverter.Poi> out = new ArrayList<>();
        for (OsmConverter.Poi p : in) {
            boolean dup = false;
            for (OsmConverter.Poi q : out) {
                if (q.t().equals(p.t()) && java.util.Objects.equals(q.name(), p.name()) && Math.hypot(q.x() - p.x(), q.z() - p.z()) < 3) { dup = true; break; }
            }
            if (!dup) out.add(p);
        }
        return out;
    }

    private static final double M_PER_DEG_LAT = 110_574.0;
    private static final double M_PER_DEG_LNG = 111_320.0;

    private record Piece(int tile, OsmConverter.Building b, double area, double[] c, boolean outline) {
    }

    public static OsmConverter.AreaData convert(List<TileData> tiles, double lat0, double lng0, double radius) {
        double kx = M_PER_DEG_LNG * Math.cos(Math.toRadians(lat0));
        List<Piece> pieces = new ArrayList<>();
        int ti = -1;
        List<OsmConverter.Road> roads = new ArrayList<>();
        List<OsmConverter.Area> areas = new ArrayList<>();
        List<OsmConverter.Poi> pois = new ArrayList<>();

        for (TileData t : tiles) {
            ti++;
            int fi = -1;
            Proj pj = new Proj(t.z, t.x, t.y, lat0, lng0, kx);
            MvtTile.Layer bl = t.layers.get("building");
            if (bl != null) {
                for (MvtTile.Feature f : bl.features()) {
                    fi++;
                    if (f.type() != MvtTile.POLYGON) continue;
                    if (f.num("render_min_height", 0) > 2) continue;
                    boolean outline = Boolean.TRUE.equals(f.tags().get("hide_3d"));
                    int k = 0;
                    for (int[] ring : f.parts()) {
                        if (MvtTile.ringArea(ring) <= 0) continue;
                        double[] poly = pj.ring(ring, bl.extent());
                        double area = Math.abs(OsmConverter.signedArea(poly));
                        if (area < 12) continue;
                        double[] c = centroid(poly);
                        if (Math.hypot(c[0], c[1]) > radius) continue;
                        double h = f.num("render_height", 0);
                        // OpenMapTiles 는 높이 정보가 없으면 5m 로 채운다 — 그 경우 크기로 추정
                        if (h <= 5.01) h = OsmConverter.estimateHeight(area, f.id() == 0 ? (long) (c[0] * 31 + c[1]) : f.id());
                        // 이 타일은 같은 높이 건물 여럿을 한 피처로 묶는다 — id 대신 타일·피처·고리 번호로 구분
                        String id = "t" + t.x + "_" + t.y + "_" + fi + "_" + (k++);
                        OsmConverter.Building b = new OsmConverter.Building(id, null, outline ? "outline" : "yes", round1(h), 0, round(OsmConverter.ccw(poly)));
                        pieces.add(new Piece(ti, b, area, c, outline));
                    }
                }
            }
            MvtTile.Layer tl = t.layers.get("transportation");
            if (tl != null) {
                for (MvtTile.Feature f : tl.features()) {
                    if (f.type() != MvtTile.LINE || "tunnel".equals(f.str("brunnel"))) continue;
                    String cls = f.str("class");
                    String rt = roadClass(cls);
                    if (rt == null) continue;
                    double w = roadWidth(cls, f.str("service"));
                    for (int[] line : f.parts()) {
                        double[] pts = pj.line(line, tl.extent());
                        if (near(pts, radius + 40)) roads.add(new OsmConverter.Road(rt, w, round(pts)));
                    }
                }
            }
            MvtTile.Layer pl = t.layers.get("poi");
            if (pl != null) {
                for (MvtTile.Feature f : pl.features()) {
                    if (f.type() != MvtTile.POINT || f.parts().isEmpty()) continue;
                    String cls = String.valueOf(f.str("class")), sub = String.valueOf(f.str("subclass"));
                    String kind;
                    if (cls.equals("railway") && (sub.equals("subway") || sub.equals("station"))) kind = "station";
                    else if (sub.equals("subway_entrance")) kind = "exit";
                    else if (SHOP_CLASSES.contains(cls) && f.str("name") != null) kind = "shop";
                    else continue;
                    int[] pt = f.parts().get(0);
                    double[] m = pj.point(pt[0], pt[1], pl.extent());
                    if (Math.hypot(m[0], m[1]) > radius + (kind.equals("station") ? 400 : 0)) continue;
                    String name = f.str("name:ko") != null ? f.str("name:ko") : f.str("name");
                    pois.add(new OsmConverter.Poi(kind, kind.equals("shop") ? cls : sub, name, round1(m[0]), round1(m[1])));
                }
            }
            addAreas(t, pj, "water", f -> "water", areas, radius);
            addAreas(t, pj, "park", f -> "park", areas, radius);
            addAreas(t, pj, "landcover", f -> switch (String.valueOf(f.str("class"))) {
                case "grass" -> "grass";
                case "wood" -> "wood";
                default -> null;
            }, areas, radius);
        }

        // 타일 경계에 걸친 건물은 양쪽 타일에 잘려 들어온다. 다른 타일 조각과 겹치면 큰 쪽만 남긴다
        pieces.sort((p, q) -> Double.compare(q.area, p.area));
        List<Piece> kept = new ArrayList<>();
        for (Piece p : pieces) {
            boolean dup = false;
            for (Piece k : kept) {
                if (k.tile == p.tile) continue;
                if (inside(p.c[0], p.c[1], k.b.poly()) || inside(k.c[0], k.c[1], p.b.poly())) { dup = true; break; }
            }
            if (!dup) kept.add(p);
        }
        // 윤곽(hide_3d)에 든 조각은 버리고, 윤곽 높이는 조각 중 가장 높은 값과 비교해 큰 쪽
        List<OsmConverter.Building> out = new ArrayList<>();
        List<Piece> outlines = kept.stream().filter(Piece::outline).toList();
        for (Piece o : outlines) {
            double h = o.b.h();
            for (Piece p : kept) if (!p.outline && inside(p.c[0], p.c[1], o.b.poly())) h = Math.max(h, p.b.h());
            out.add(new OsmConverter.Building(o.b.id(), null, "yes", h, 0, o.b.poly()));
        }
        for (Piece p : kept) {
            if (p.outline) continue;
            boolean isPart = false;
            for (Piece o : outlines) if (inside(p.c[0], p.c[1], o.b.poly())) { isPart = true; break; }
            if (!isPart) out.add(p.b);
        }
        return new OsmConverter.AreaData(lat0, lng0, radius, out, roads, areas, dedupePois(pois), false);
    }

    private interface Kind {
        String of(MvtTile.Feature f);
    }

    private static void addAreas(TileData t, Proj pj, String layer, Kind kind, List<OsmConverter.Area> out, double radius) {
        MvtTile.Layer l = t.layers.get(layer);
        if (l == null) return;
        for (MvtTile.Feature f : l.features()) {
            if (f.type() != MvtTile.POLYGON) continue;
            String k = kind.of(f);
            if (k == null) continue;
            for (int[] ring : f.parts()) {
                if (MvtTile.ringArea(ring) <= 0) continue;
                double[] poly = pj.ring(ring, l.extent());
                if (near(poly, radius + 80) || inside(0, 0, poly)) out.add(new OsmConverter.Area(k, round(clip(poly, radius * 2.5))));
            }
        }
    }

    /** 바다·큰 공원처럼 거대한 면은 게임 범위 밖 좌표를 상자 안으로 눌러 둔다 */
    private static double[] clip(double[] p, double lim) {
        double[] o = p.clone();
        for (int i = 0; i < o.length; i++) o[i] = Math.max(-lim, Math.min(lim, o[i]));
        return o;
    }

    static String roadClass(String cls) {
        if (cls == null) return null;
        return switch (cls) {
            case "motorway", "trunk", "primary" -> "major";
            case "secondary", "tertiary" -> "mid";
            case "minor", "service" -> "minor";
            default -> null;
        };
    }

    static double roadWidth(String cls, String service) {
        return switch (cls) {
            case "motorway", "trunk" -> 20;
            case "primary" -> 16;
            case "secondary" -> 12;
            case "tertiary" -> 9;
            case "minor" -> 6;
            default -> service == null ? 4.5 : 3.5;
        };
    }

    /** 타일 좌표 → 중심 기준 미터 */
    private static final class Proj {
        final double n, x0, y0, lat0, lng0, kx;

        Proj(int z, int x, int y, double lat0, double lng0, double kx) {
            this.n = 1 << z;
            this.x0 = x;
            this.y0 = y;
            this.lat0 = lat0;
            this.lng0 = lng0;
            this.kx = kx;
        }

        double[] point(double px, double py, int extent) {
            double lng = (x0 + px / extent) / n * 360 - 180;
            double m = Math.PI * (1 - 2 * (y0 + py / extent) / n);
            double lat = Math.toDegrees(Math.atan(Math.sinh(m)));
            return new double[]{(lng - lng0) * kx, -(lat - lat0) * M_PER_DEG_LAT};
        }

        double[] ring(int[] r, int extent) {
            double[] o = new double[r.length];
            for (int i = 0; i < r.length; i += 2) {
                double[] p = point(r[i], r[i + 1], extent);
                o[i] = p[0];
                o[i + 1] = p[1];
            }
            return o;
        }

        double[] line(int[] r, int extent) {
            return ring(r, extent);
        }
    }

    static boolean inside(double x, double z, double[] p) {
        boolean in = false;
        int n = p.length / 2;
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
            if ((zi > z) != (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) in = !in;
        }
        return in;
    }

    private static double[] centroid(double[] r) {
        double x = 0, z = 0;
        int n = r.length / 2;
        for (int i = 0; i < n; i++) {
            x += r[i * 2];
            z += r[i * 2 + 1];
        }
        return new double[]{x / n, z / n};
    }

    private static boolean near(double[] p, double radius) {
        for (int i = 0; i < p.length; i += 2) if (Math.hypot(p[i], p[i + 1]) < radius) return true;
        return false;
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private static double[] round(double[] p) {
        double[] o = new double[p.length];
        for (int i = 0; i < p.length; i++) o[i] = round1(p[i]);
        return o;
    }
}
