package com.example.game.service.smash;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * 브이월드(국토교통부 공간정보 오픈플랫폼).
 *
 * <p>건물: LT_C_BLDGINFO(GIS 건물통합정보, 건축물대장 기반)에 실제 바닥 모양·높이(m)·지상 층수·주용도가 있다.
 * OSM 보다 빠짐이 거의 없고 높이가 정확하다. 건물 이름은 LT_C_SPBD(도로명주소 건물)에서 붙인다.
 * 항공사진: WMTS Satellite 타일을 서버가 대신 받아 준다 (키를 화면에 노출하지 않고, 디스크에 캐시).
 * 키는 사이트 주소에 묶여 있어 요청에 domain 을 같이 보낸다.
 */
@Slf4j
@Service
public class SmashVWorldService {

    private static final double M_PER_DEG_LAT = 110_574.0;
    private static final double M_PER_DEG_LNG = 111_320.0;

    private final ObjectMapper om = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();
    private final String key;
    private final String domain;
    private final Path satDir;
    private final Map<String, List<OsmConverter.Building>> memory = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, List<OsmConverter.Building>> e) {
            return size() > 40;
        }
    };

    public SmashVWorldService(@Value("${smash.vworld-key:${VWORLD_KEY:}}") String key,
                              @Value("${smash.vworld-domain:https://game.binaryworld.kr}") String domain,
                              @Value("${smash.cache-dir:${java.io.tmpdir}/smash-osm}") String cacheDir) {
        this.key = key == null ? "" : key.trim();
        this.domain = domain;
        this.satDir = Path.of(cacheDir, "sat");
        try {
            Files.createDirectories(satDir);
        } catch (IOException e) {
            log.warn("smash sat cache dir unavailable: {}", e.getMessage());
        }
    }

    public boolean enabled() {
        return !key.isEmpty();
    }

    /** 대략 한반도 남쪽 안인가 (브이월드는 국내 자료만 있다) */
    public static boolean inKorea(double lat, double lng) {
        return lat > 33 && lat < 38.7 && lng > 124.5 && lng < 131.9;
    }

    // ── 건물 ──

    public List<OsmConverter.Building> buildings(double lat, double lng, double radius) throws IOException {
        String mk = String.format(Locale.ROOT, "%.4f,%.4f", lat, lng);
        synchronized (memory) {
            List<OsmConverter.Building> m = memory.get(mk);
            if (m != null) return m;
        }
        double r = radius + 40;
        double dLat = r / M_PER_DEG_LAT, dLng = r / (M_PER_DEG_LNG * Math.cos(Math.toRadians(lat)));
        String box = String.format(Locale.ROOT, "BOX(%.6f,%.6f,%.6f,%.6f)", lng - dLng, lat - dLat, lng + dLng, lat + dLat);
        CompletableFuture<List<JsonNode>> info = CompletableFuture.supplyAsync(() -> features("LT_C_BLDGINFO", box));
        CompletableFuture<List<JsonNode>> names = CompletableFuture.supplyAsync(() -> features("LT_C_SPBD", box));
        List<OsmConverter.Building> out;
        try {
            out = convert(info.join(), names.join(), lat, lng, radius);
        } catch (java.util.concurrent.CompletionException e) {
            throw new IOException("vworld: " + (e.getCause() != null ? e.getCause().getMessage() : e.getMessage()));
        }
        synchronized (memory) {
            memory.put(mk, out);
        }
        return out;
    }

    private List<JsonNode> features(String layer, String box) {
        List<JsonNode> all = new ArrayList<>();
        for (int page = 1; page <= 6; page++) {
            String url = "https://api.vworld.kr/req/data?service=data&request=GetFeature&format=json&crs=EPSG:4326&size=1000"
                    + "&data=" + layer + "&page=" + page
                    + "&geomFilter=" + URLEncoder.encode(box, StandardCharsets.UTF_8)
                    + "&key=" + key + "&domain=" + URLEncoder.encode(domain, StandardCharsets.UTF_8);
            try {
                HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12)).GET().build(),
                        HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() != 200) throw new IllegalStateException(layer + " HTTP " + res.statusCode());
                JsonNode resp = om.readTree(res.body()).path("response");
                String status = resp.path("status").asText();
                if ("NOT_FOUND".equals(status)) break;
                if (!"OK".equals(status)) throw new IllegalStateException(layer + " " + status + " " + resp.path("error").toString());
                resp.path("result").path("featureCollection").path("features").forEach(all::add);
                if (page >= resp.path("page").path("total").asInt(1)) break;
            } catch (IOException e) {
                throw new IllegalStateException(layer + " " + e.getMessage());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("interrupted");
            }
        }
        return all;
    }

    static List<OsmConverter.Building> convert(List<JsonNode> info, List<JsonNode> names, double lat0, double lng0, double radius) {
        double kx = M_PER_DEG_LNG * Math.cos(Math.toRadians(lat0));
        // 이름: 도로명주소 건물의 무게중심이 든 건물에 붙인다
        List<double[]> nameAt = new ArrayList<>();
        List<String> nameText = new ArrayList<>();
        for (JsonNode f : names) {
            JsonNode p = f.path("properties");
            String nm = p.path("buld_nm").asText("").trim();
            if (nm.isEmpty()) continue;
            String dc = p.path("buld_nm_dc").asText("").trim();
            if (!dc.isEmpty() && !nm.contains(dc)) nm = nm + " " + dc;
            for (double[] ring : rings(f.path("geometry"), lat0, lng0, kx)) {
                nameAt.add(centroid(ring));
                nameText.add(nm);
            }
        }
        List<OsmConverter.Building> out = new ArrayList<>();
        for (JsonNode f : info) {
            JsonNode p = f.path("properties");
            int floors = p.path("grnd_flr").asInt(0);
            double h = OsmConverter.parseDouble(p.path("height").asText(""));
            if (floors <= 0 && h <= 0) continue;
            String kind = kind(p.path("usability").asText(""));
            String own = joinName(p.path("bld_nm").asText(""), p.path("dong_nm").asText(""));
            String id = "v" + f.path("id").asText("").replaceAll("\\D", "");
            int k = 0;
            for (double[] ring : rings(f.path("geometry"), lat0, lng0, kx)) {
                double area = Math.abs(OsmConverter.signedArea(ring));
                if (area < 10) continue;
                double[] c = centroid(ring);
                if (Math.hypot(c[0], c[1]) > radius) continue;
                double height = h > 2 && h < 700 ? h : floors * 3.3 + 1.5;
                String name = own.isEmpty() ? null : own;
                if (name == null) {
                    for (int i = 0; i < nameAt.size(); i++) {
                        if (MvtAreaConverter.inside(nameAt.get(i)[0], nameAt.get(i)[1], ring)) { name = nameText.get(i); break; }
                    }
                }
                out.add(new OsmConverter.Building(id + (k++ == 0 ? "" : "-" + k), name, kind, round1(height), floors, round(OsmConverter.ccw(ring))));
            }
        }
        return out;
    }

    /** 건물명 + 동 이름. 같은 말이 겹치거나 "주건축물제1동" 같은 대장용 표기는 뺀다 */
    static String joinName(String bld, String dong) {
        String b = bld == null ? "" : bld.trim(), d = dong == null ? "" : dong.trim();
        if (d.isEmpty() || d.contains("주건축물") || d.contains("부속")) return b;
        if (b.isEmpty()) return d;
        if (b.contains(d)) return b;
        if (d.contains(b)) return d;
        return b + " " + d;
    }

    /** 건축물 주용도 코드(앞 두 자리) → 게임의 건물 종류 */
    static String kind(String code) {
        if (code == null || code.length() < 2) return "yes";
        return switch (code.substring(0, 2)) {
            case "01" -> "house";
            case "02" -> "apartments";
            case "03", "04", "07", "16" -> "commercial";
            case "14" -> "office";
            case "10" -> "school";
            case "09" -> "hospital";
            case "15" -> "hotel";
            case "17", "18" -> "industrial";
            case "05", "06", "11", "12", "13", "08" -> "civic";
            default -> "yes";
        };
    }

    private static List<double[]> rings(JsonNode geom, double lat0, double lng0, double kx) {
        List<double[]> out = new ArrayList<>();
        JsonNode coords = geom.path("coordinates");
        String type = geom.path("type").asText();
        List<JsonNode> polys = new ArrayList<>();
        if ("Polygon".equals(type)) polys.add(coords);
        else if ("MultiPolygon".equals(type)) coords.forEach(polys::add);
        for (JsonNode poly : polys) {
            JsonNode outer = poly.path(0);
            if (!outer.isArray() || outer.size() < 4) continue;
            int n = outer.size();
            boolean closed = outer.get(0).get(0).asDouble() == outer.get(n - 1).get(0).asDouble() && outer.get(0).get(1).asDouble() == outer.get(n - 1).get(1).asDouble();
            if (closed) n--;
            double[] r = new double[n * 2];
            for (int i = 0; i < n; i++) {
                r[i * 2] = (outer.get(i).get(0).asDouble() - lng0) * kx;
                r[i * 2 + 1] = -(outer.get(i).get(1).asDouble() - lat0) * M_PER_DEG_LAT;
            }
            if (n >= 3) out.add(r);
        }
        return out;
    }

    private static double[] centroid(double[] r) {
        double x = 0, z = 0;
        int n = r.length / 2;
        for (int i = 0; i < n; i++) { x += r[i * 2]; z += r[i * 2 + 1]; }
        return new double[]{x / n, z / n};
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private static double[] round(double[] p) {
        double[] o = new double[p.length];
        for (int i = 0; i < p.length; i++) o[i] = round1(p[i]);
        return o;
    }

    // ── 항공사진 ──

    /** 줌 15~19, 국내 범위의 타일만. 디스크에 캐시한다 */
    public byte[] satTile(int z, int x, int y) throws IOException {
        if (z < 15 || z > 19) throw new IllegalArgumentException("zoom");
        double lng = x / (double) (1 << z) * 360 - 180;
        double lat = Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1 - 2.0 * y / (1 << z)))));
        if (!inKorea(lat, lng)) throw new IllegalArgumentException("range");
        Path f = satDir.resolve(z + "_" + x + "_" + y + ".jpg");
        if (Files.exists(f)) return Files.readAllBytes(f);
        String url = "https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/" + z + "/" + y + "/" + x + ".jpeg";
        try {
            HttpResponse<byte[]> res = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                    .header("Referer", domain + "/").GET().build(), HttpResponse.BodyHandlers.ofByteArray());
            byte[] b = res.body();
            if (res.statusCode() != 200 || b.length < 3 || (b[0] & 0xff) != 0xff || (b[1] & 0xff) != 0xd8) throw new IOException("sat HTTP " + res.statusCode());
            Path tmp = satDir.resolve(z + "_" + x + "_" + y + ".tmp");
            Files.write(tmp, b);
            Files.move(tmp, f, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            return b;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted");
        }
    }
}
