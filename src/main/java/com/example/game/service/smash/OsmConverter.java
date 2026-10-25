package com.example.game.service.smash;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Overpass 응답(out geom)을 게임이 쓰는 모양으로 바꾼다.
 * 좌표는 요청 중심에서의 미터 거리다: x = 동쪽, z = 남쪽 (three.js 의 -z 가 북쪽).
 * 건물 높이는 height → building:levels → 용도·면적 추정 순으로 정한다.
 */
public final class OsmConverter {

    private OsmConverter() {
    }

    public record Building(String id, String name, String kind, double h, int lv, double[] poly) {
    }

    public record Road(String t, double w, double[] pts) {
    }

    public record Area(String t, double[] poly) {
    }

    /** 표시물. t = station(역) | exit(지하철 출구) | shop(이름 있는 가게·병원·은행 등) */
    public record Poi(String t, String cls, String name, double x, double z) {
    }

    /** sat: 항공사진 바닥을 쓸 수 있는가 (브이월드 키가 있을 때) */
    public record AreaData(double lat, double lng, double radius,
                           List<Building> buildings, List<Road> roads, List<Area> areas, List<Poi> pois, boolean sat) {
        public AreaData withBuildings(List<Building> b, boolean sat) {
            return new AreaData(lat, lng, radius, b, roads, areas, pois, sat);
        }
    }

    private static final double M_PER_DEG_LAT = 110_574.0;
    private static final double M_PER_DEG_LNG = 111_320.0;
    private static final Pattern NUM = Pattern.compile("(-?\\d+(?:\\.\\d+)?)");

    public static AreaData convert(Iterable<JsonNode> elements, double lat0, double lng0, double radius) {
        double kx = M_PER_DEG_LNG * Math.cos(Math.toRadians(lat0));
        List<Building> buildings = new ArrayList<>();
        List<Road> roads = new ArrayList<>();
        List<Area> areas = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode el : elements) {
            String key = el.path("type").asText() + el.path("id").asLong();
            if (!seen.add(key)) continue;
            JsonNode tags = el.path("tags");
            String building = tags.path("building").asText("");
            if ("relation".equals(el.path("type").asText())) {
                // 멀티폴리곤 건물: 조각난 outer 를 이어 붙인 고리마다 건물 한 동 (트윈타워 = 두 동)
                if (building.isEmpty() || building.equals("no") || building.equals("roof")) continue;
                int k = 0;
                for (double[] ring : outerRings(el, lat0, lng0, kx)) {
                    Building b = toBuilding(ring, tags, building, el.path("id").asLong(), "r" + el.path("id").asLong() + (k == 0 ? "" : "-" + k), radius);
                    k++;
                    if (b != null) buildings.add(b);
                }
                continue;
            }
            double[] pts = project(el.path("geometry"), lat0, lng0, kx);
            if (pts == null || pts.length < 4) continue;

            if (!building.isEmpty() && !building.equals("no") && !building.equals("roof")) {
                if (pts.length < 8 || !closed(pts)) continue;
                Building b = toBuilding(pts, tags, building, el.path("id").asLong(), "w" + el.path("id").asLong(), radius);
                if (b != null) buildings.add(b);
                continue;
            }
            String hw = tags.path("highway").asText("");
            if (!hw.isEmpty()) {
                double w = roadWidth(hw, tags);
                if (w <= 0 || !near(pts, radius + 40)) continue;
                roads.add(new Road(roadClass(hw), w, round(pts)));
                continue;
            }
            String kind = areaKind(tags);
            if (kind != null && closed(pts) && near(pts, radius + 80)) {
                areas.add(new Area(kind, round(dropClosing(pts))));
            }
        }
        return new AreaData(lat0, lng0, radius, buildings, roads, areas, List.of(), false);
    }

    private static Building toBuilding(double[] pts, JsonNode tags, String building, long osmId, String id, double radius) {
        double[] ring = dropClosing(pts);
        if (ring.length < 6) return null;
        double[] c = centroid(ring);
        if (Math.hypot(c[0], c[1]) > radius) return null;
        double area = Math.abs(signedArea(ring));
        if (area < 12) return null;
        int lv = parseInt(tags.path("building:levels").asText(""));
        double h = height(tags, building, lv, area, osmId);
        return new Building(id, tags.path("name").asText(null), building, round1(h), lv, round(ccw(ring)));
    }

    /** outer 멤버 조각들을 끝점끼리 이어 닫힌 고리로 만든다. 못 닫는 조각은 버린다 (안뜰 구멍 inner 는 무시). */
    static List<double[]> outerRings(JsonNode rel, double lat0, double lng0, double kx) {
        List<double[]> parts = new ArrayList<>();
        for (JsonNode m : rel.path("members")) {
            if (!"outer".equals(m.path("role").asText()) || !m.has("geometry")) continue;
            double[] p = project(m.path("geometry"), lat0, lng0, kx);
            if (p != null && p.length >= 4) parts.add(p);
        }
        List<double[]> rings = new ArrayList<>();
        while (!parts.isEmpty()) {
            double[] cur = parts.remove(0);
            boolean grew = true;
            while (!closed(cur) && grew) {
                grew = false;
                for (int i = 0; i < parts.size(); i++) {
                    double[] p = parts.get(i);
                    double[] joined = join(cur, p);
                    if (joined == null) joined = join(cur, reverse(p));
                    if (joined != null) {
                        cur = joined;
                        parts.remove(i);
                        grew = true;
                        break;
                    }
                }
            }
            if (closed(cur) && cur.length >= 8) rings.add(cur);
        }
        return rings;
    }

    private static double[] join(double[] a, double[] b) {
        int n = a.length;
        if (Math.abs(a[n - 2] - b[0]) > 0.05 || Math.abs(a[n - 1] - b[1]) > 0.05) return null;
        double[] out = new double[n + b.length - 2];
        System.arraycopy(a, 0, out, 0, n);
        System.arraycopy(b, 2, out, n, b.length - 2);
        return out;
    }

    private static double[] reverse(double[] p) {
        int n = p.length / 2;
        double[] o = new double[p.length];
        for (int i = 0; i < n; i++) {
            o[i * 2] = p[(n - 1 - i) * 2];
            o[i * 2 + 1] = p[(n - 1 - i) * 2 + 1];
        }
        return o;
    }

    private static double[] project(JsonNode geom, double lat0, double lng0, double kx) {
        if (!geom.isArray() || geom.size() < 2) return null;
        double[] out = new double[geom.size() * 2];
        int i = 0;
        for (JsonNode g : geom) {
            if (!g.has("lat")) return null;
            out[i++] = (g.path("lon").asDouble() - lng0) * kx;
            out[i++] = -(g.path("lat").asDouble() - lat0) * M_PER_DEG_LAT;
        }
        return out;
    }

    /** 높이 정보가 전혀 없는 건물: 크기로 추정 */
    static double estimateHeight(double area, long id) {
        return height(com.fasterxml.jackson.databind.node.MissingNode.getInstance(), "yes", 0, area, id);
    }

    static double height(JsonNode tags, String building, int lv, double area, long id) {
        double h = parseDouble(tags.path("height").asText(""));
        if (h > 2 && h < 700) return h;
        if (lv > 0 && lv < 200) return lv * 3.3 + 1.5;
        // 결정적인 흔들림: 같은 건물은 항상 같은 높이
        double j = ((id * 2654435761L) >>> 8 & 0xffff) / 65535.0;
        switch (building) {
            case "house", "detached", "bungalow", "hut", "shed", "garage", "garages", "kiosk":
                return 5 + j * 4;
            case "apartments":
                return area > 600 ? 38 + j * 22 : 14 + j * 10;
            case "industrial", "warehouse", "factory":
                return 9 + j * 6;
            case "church", "temple", "school", "university", "hospital":
                return 12 + j * 10;
            case "office", "commercial":
                return area > 1500 ? 40 + j * 30 : 14 + j * 16;
            default:
                if (area < 120) return 6 + j * 4;
                if (area < 400) return 10 + j * 8;
                if (area < 1500) return 15 + j * 12;
                return 20 + j * 18;
        }
    }

    static double roadWidth(String hw, JsonNode tags) {
        double w = parseDouble(tags.path("width").asText(""));
        if (w > 1 && w < 60) return w;
        int lanes = parseInt(tags.path("lanes").asText(""));
        double base = switch (hw) {
            case "motorway", "trunk" -> 20;
            case "primary" -> 16;
            case "secondary" -> 12;
            case "tertiary" -> 9;
            case "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link" -> 7;
            case "residential", "unclassified", "living_street" -> 6;
            case "service" -> 4;
            case "pedestrian" -> 5;
            case "footway", "path", "cycleway" -> 2;
            default -> 0;
        };
        if (lanes > 0 && base >= 6) return Math.max(base * 0.6, lanes * 3.3);
        return base;
    }

    private static String roadClass(String hw) {
        return switch (hw) {
            case "motorway", "trunk", "primary", "motorway_link", "trunk_link", "primary_link" -> "major";
            case "secondary", "tertiary", "secondary_link", "tertiary_link" -> "mid";
            case "footway", "path", "cycleway", "pedestrian" -> "foot";
            default -> "minor";
        };
    }

    private static String areaKind(JsonNode tags) {
        String natural = tags.path("natural").asText("");
        String landuse = tags.path("landuse").asText("");
        String leisure = tags.path("leisure").asText("");
        if (natural.equals("water") || tags.path("waterway").asText("").equals("riverbank")) return "water";
        if (natural.equals("wood") || landuse.equals("forest") || natural.equals("scrub")) return "wood";
        if (leisure.equals("park") || leisure.equals("garden") || leisure.equals("playground")) return "park";
        if (leisure.equals("pitch")) return "pitch";
        if (landuse.equals("grass") || landuse.equals("meadow") || landuse.equals("recreation_ground") || landuse.equals("village_green")) return "grass";
        return null;
    }

    static int parseInt(String s) {
        Matcher m = NUM.matcher(s);
        if (!m.find()) return 0;
        try {
            return (int) Math.round(Double.parseDouble(m.group(1)));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static double parseDouble(String s) {
        Matcher m = NUM.matcher(s.toLowerCase(Locale.ROOT));
        if (!m.find()) return 0;
        try {
            double v = Double.parseDouble(m.group(1));
            return s.contains("ft") ? v * 0.3048 : v;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static boolean closed(double[] p) {
        int n = p.length;
        return Math.abs(p[0] - p[n - 2]) < 0.01 && Math.abs(p[1] - p[n - 1]) < 0.01;
    }

    private static double[] dropClosing(double[] p) {
        if (!closed(p)) return p;
        double[] r = new double[p.length - 2];
        System.arraycopy(p, 0, r, 0, r.length);
        return r;
    }

    static double signedArea(double[] r) {
        double a = 0;
        int n = r.length / 2;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            a += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1];
        }
        return a / 2;
    }

    /** 감기는 방향을 하나로 맞춘다: (x, z) 신발끈 면적이 음수. 게임 쪽 벽 법선 계산이 이걸 가정한다. */
    static double[] ccw(double[] r) {
        if (signedArea(r) < 0) return r;
        int n = r.length / 2;
        double[] o = new double[r.length];
        for (int i = 0; i < n; i++) {
            o[i * 2] = r[(n - 1 - i) * 2];
            o[i * 2 + 1] = r[(n - 1 - i) * 2 + 1];
        }
        return o;
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
        for (int i = 0; i < p.length; i += 2) {
            if (Math.hypot(p[i], p[i + 1]) < radius) return true;
        }
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
