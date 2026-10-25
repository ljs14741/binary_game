package com.example.game.service.smash;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
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
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * 회사 주변 OSM 데이터. Overpass 공개 서버에서 받아 줌 17 타일(약 240m) 단위로 캐시한다.
 *
 * <p>공개 서버는 호출량 제한이 있어서 같은 동네를 두 번 받지 않는 게 중요하다.
 * 타일 키는 위치와 무관한 격자 번호라, 어느 검색 결과에서 왔는지는 남지 않는다
 * (카카오 로컬 결과는 저장하면 안 된다 — 저장하는 건 OSM 데이터뿐).
 */
@Slf4j
@Service
public class SmashAreaService {

    static final int ZOOM = 17;
    public static final double RADIUS = 260;
    private static final Duration TTL = Duration.ofDays(30);
    private static final String[] ENDPOINTS = {
            "https://overpass-api.de/api/interpreter",
            "https://overpass.private.coffee/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
    };

    private final ObjectMapper om = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final Semaphore upstream = new Semaphore(2);
    private final Path cacheDir;
    private final Map<String, List<JsonNode>> memory = new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, List<JsonNode>> e) {
            return size() > 400;
        }
    };

    private final SmashVWorldService vworld;

    public SmashAreaService(@Value("${smash.cache-dir:${java.io.tmpdir}/smash-osm}") String cacheDir, SmashVWorldService vworld) {
        this.vworld = vworld;
        this.cacheDir = Path.of(cacheDir);
        try {
            Files.createDirectories(this.cacheDir);
        } catch (IOException e) {
            log.warn("smash cache dir unavailable: {}", e.getMessage());
        }
    }

    /**
     * 기본은 OpenFreeMap 벡터 타일 (CDN, 타일 하나 0.3초 안팎). 실패하면 Overpass 로 대신 받는다.
     * Overpass 공개 서버는 붐비면 작은 질의도 30초씩 걸려서 기본 경로로 쓰기엔 불안정했다.
     */
    public OsmConverter.AreaData area(double lat, double lng) throws IOException {
        OsmConverter.AreaData base;
        try {
            base = openFreeMap(lat, lng);
        } catch (IOException e) {
            log.warn("openfreemap failed, falling back to overpass: {}", e.getMessage());
            base = overpassArea(lat, lng);
        }
        // 국내면 건물은 브이월드(국토부 건물통합정보)로 바꾼다 — 실제 높이·모양·이름. 실패하면 OSM 건물 그대로
        if (vworld.enabled() && SmashVWorldService.inKorea(lat, lng)) {
            try {
                List<OsmConverter.Building> vb = vworld.buildings(lat, lng, RADIUS);
                if (!vb.isEmpty()) return base.withBuildings(vb, true);
                return base.withBuildings(base.buildings(), true);
            } catch (IOException e) {
                log.warn("vworld buildings failed, keeping osm: {}", e.getMessage());
            }
        }
        return base;
    }

    // ── OpenFreeMap ──

    static final int MVT_ZOOM = 14;
    private static final String OFM_TILEJSON = "https://tiles.openfreemap.org/planet";
    private volatile String ofmTemplate;
    private volatile long ofmTemplateAt;
    private final Map<String, byte[]> mvtMemory = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, byte[]> e) {
            return size() > 60;
        }
    };

    private OsmConverter.AreaData openFreeMap(double lat, double lng) throws IOException {
        List<MvtAreaConverter.TileData> tiles = new ArrayList<>();
        for (int[] t : tilesAround(lat, lng, RADIUS + 60, MVT_ZOOM)) {
            byte[] pbf = mvtTile(t[0], t[1]);
            tiles.add(new MvtAreaConverter.TileData(MVT_ZOOM, t[0], t[1], MvtTile.decode(pbf)));
        }
        return MvtAreaConverter.convert(tiles, lat, lng, RADIUS);
    }

    private byte[] mvtTile(int x, int y) throws IOException {
        String key = "ofm" + MVT_ZOOM + "_" + x + "_" + y;
        synchronized (mvtMemory) {
            byte[] m = mvtMemory.get(key);
            if (m != null) return m;
        }
        Path f = cacheDir.resolve(key + ".pbf");
        if (Files.exists(f) && Instant.now().minus(TTL).isBefore(Files.getLastModifiedTime(f).toInstant())) {
            byte[] b = Files.readAllBytes(f);
            synchronized (mvtMemory) { mvtMemory.put(key, b); }
            return b;
        }
        String url = ofmTemplate().replace("{z}", String.valueOf(MVT_ZOOM)).replace("{x}", String.valueOf(x)).replace("{y}", String.valueOf(y));
        HttpResponse<byte[]> res = send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12))
                .header("User-Agent", "BinaryWorld-Game/1.0 (+https://game.binaryworld.kr)").GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        if (res.statusCode() != 200) throw new IOException("tile HTTP " + res.statusCode());
        byte[] b = gunzipIfNeeded(res.body());
        try {
            Path tmp = cacheDir.resolve(key + ".tmp");
            Files.write(tmp, b);
            Files.move(tmp, f, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.warn("smash tile cache write failed {}: {}", key, e.getMessage());
        }
        synchronized (mvtMemory) { mvtMemory.put(key, b); }
        return b;
    }

    /** 타일 주소에 판 번호가 들어 있어 주기적으로 바뀐다. TileJSON 에서 6시간마다 다시 읽는다 */
    private String ofmTemplate() throws IOException {
        if (ofmTemplate != null && System.currentTimeMillis() - ofmTemplateAt < Duration.ofHours(6).toMillis()) return ofmTemplate;
        HttpResponse<String> res = send(HttpRequest.newBuilder(URI.create(OFM_TILEJSON)).timeout(Duration.ofSeconds(8)).GET().build(), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new IOException("tilejson HTTP " + res.statusCode());
        String t = om.readTree(res.body()).path("tiles").path(0).asText("");
        if (!t.contains("{z}")) throw new IOException("tilejson has no tiles");
        ofmTemplate = t;
        ofmTemplateAt = System.currentTimeMillis();
        return t;
    }

    private static byte[] gunzipIfNeeded(byte[] b) throws IOException {
        if (b.length > 2 && (b[0] & 0xff) == 0x1f && (b[1] & 0xff) == 0x8b) {
            try (java.util.zip.GZIPInputStream in = new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(b))) {
                return in.readAllBytes();
            }
        }
        return b;
    }

    private <T> HttpResponse<T> send(HttpRequest req, HttpResponse.BodyHandler<T> h) throws IOException {
        try {
            return http.send(req, h);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted");
        }
    }

    // ── Overpass (예비) ──

    private OsmConverter.AreaData overpassArea(double lat, double lng) throws IOException {
        List<int[]> tiles = tilesAround(lat, lng, RADIUS + 60);
        List<int[]> missing = new ArrayList<>();
        List<JsonNode> elements = new ArrayList<>();
        for (int[] t : tiles) {
            List<JsonNode> cached = load(key(t));
            if (cached == null) missing.add(t);
            else elements.addAll(cached);
        }
        if (!missing.isEmpty()) {
            Map<String, List<JsonNode>> fetched = fetch(missing);
            for (int[] t : missing) {
                List<JsonNode> list = fetched.getOrDefault(key(t), List.of());
                store(key(t), list);
                elements.addAll(list);
            }
        }
        return OsmConverter.convert(elements, lat, lng, RADIUS);
    }

    // ── 타일 ──

    static int lngToX(double lng) {
        return lngToX(lng, ZOOM);
    }

    static int latToY(double lat) {
        return latToY(lat, ZOOM);
    }

    static int lngToX(double lng, int zoom) {
        return (int) Math.floor((lng + 180) / 360 * (1 << zoom));
    }

    static int latToY(double lat, int zoom) {
        double r = Math.toRadians(lat);
        return (int) Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << zoom));
    }

    static double xToLng(int x) {
        return x / (double) (1 << ZOOM) * 360 - 180;
    }

    static double yToLat(int y) {
        double n = Math.PI - 2 * Math.PI * y / (1 << ZOOM);
        return Math.toDegrees(Math.atan(Math.sinh(n)));
    }

    static List<int[]> tilesAround(double lat, double lng, double meters) {
        return tilesAround(lat, lng, meters, ZOOM);
    }

    static List<int[]> tilesAround(double lat, double lng, double meters, int zoom) {
        double dLat = meters / 110_574.0;
        double dLng = meters / (111_320.0 * Math.cos(Math.toRadians(lat)));
        int x0 = lngToX(lng - dLng, zoom), x1 = lngToX(lng + dLng, zoom);
        int y0 = latToY(lat + dLat, zoom), y1 = latToY(lat - dLat, zoom);
        List<int[]> out = new ArrayList<>();
        for (int x = x0; x <= x1; x++) for (int y = y0; y <= y1; y++) out.add(new int[]{x, y});
        return out;
    }

    private static String key(int[] t) {
        return ZOOM + "_" + t[0] + "_" + t[1];
    }

    // ── 캐시 ──

    private List<JsonNode> load(String key) {
        synchronized (memory) {
            List<JsonNode> m = memory.get(key);
            if (m != null) return m;
        }
        Path f = cacheDir.resolve(key + ".json");
        try {
            if (Files.exists(f) && Instant.now().minus(TTL).isBefore(Files.getLastModifiedTime(f).toInstant())) {
                List<JsonNode> list = new ArrayList<>();
                om.readTree(f.toFile()).forEach(list::add);
                synchronized (memory) {
                    memory.put(key, list);
                }
                return list;
            }
        } catch (IOException e) {
            log.warn("smash cache read failed {}: {}", key, e.getMessage());
        }
        return null;
    }

    private void store(String key, List<JsonNode> list) {
        synchronized (memory) {
            memory.put(key, list);
        }
        try {
            ArrayNode arr = om.createArrayNode();
            list.forEach(arr::add);
            Path tmp = cacheDir.resolve(key + ".tmp");
            om.writeValue(tmp.toFile(), arr);
            Files.move(tmp, cacheDir.resolve(key + ".json"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.warn("smash cache write failed {}: {}", key, e.getMessage());
        }
    }

    // ── Overpass ──

    /** 빠진 타일들을 감싸는 상자 하나로 한 번에 받고, 요소 중심이 든 타일로 나눠 담는다. */
    private Map<String, List<JsonNode>> fetch(List<int[]> tiles) throws IOException {
        int x0 = Integer.MAX_VALUE, x1 = Integer.MIN_VALUE, y0 = Integer.MAX_VALUE, y1 = Integer.MIN_VALUE;
        for (int[] t : tiles) {
            x0 = Math.min(x0, t[0]); x1 = Math.max(x1, t[0]);
            y0 = Math.min(y0, t[1]); y1 = Math.max(y1, t[1]);
        }
        double s = yToLat(y1 + 1), n = yToLat(y0), w = xToLng(x0), e = xToLng(x1 + 1);
        String bbox = String.format(java.util.Locale.ROOT, "%.6f,%.6f,%.6f,%.6f", s, w, n, e);
        // 멀티폴리곤 건물은 따로 out body geom 으로 받는다 — out tags 는 relation 의 members(외곽선)를 빼 버린다
        String q = "[out:json][timeout:20];("
                + "way[\"building\"](" + bbox + ");"
                + "way[\"highway\"~\"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$\"](" + bbox + ");"
                + "way[\"leisure\"~\"^(park|garden|pitch|playground)$\"](" + bbox + ");"
                + "way[\"landuse\"~\"^(grass|forest|recreation_ground|meadow|village_green)$\"](" + bbox + ");"
                + "way[\"natural\"~\"^(water|wood|scrub)$\"](" + bbox + ");"
                + "way[\"waterway\"=\"riverbank\"](" + bbox + ");"
                + ");out tags geom;"
                + "relation[\"building\"][\"type\"=\"multipolygon\"](" + bbox + ");out body geom;";
        JsonNode root = query(q);
        Map<String, List<JsonNode>> out = new LinkedHashMap<>();
        for (int[] t : tiles) out.put(key(t), new ArrayList<>());
        for (JsonNode el : root.path("elements")) {
            double[] c = center(el);
            if (c == null) continue;
            String k = key(new int[]{lngToX(c[1]), latToY(c[0])});
            List<JsonNode> list = out.get(k);
            if (list != null) list.add(el);
        }
        return out;
    }

    private static double[] center(JsonNode el) {
        JsonNode b = el.path("bounds");
        if (b.has("minlat")) {
            return new double[]{(b.path("minlat").asDouble() + b.path("maxlat").asDouble()) / 2,
                    (b.path("minlon").asDouble() + b.path("maxlon").asDouble()) / 2};
        }
        JsonNode g = el.path("geometry");
        if (g.isArray() && g.size() > 0) {
            JsonNode p = g.get(g.size() / 2);
            return new double[]{p.path("lat").asDouble(), p.path("lon").asDouble()};
        }
        return null;
    }

    private JsonNode query(String q) throws IOException {
        IOException last = null;
        try {
            if (!upstream.tryAcquire(30, TimeUnit.SECONDS)) throw new IOException("overpass busy");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted");
        }
        // 화면 쪽은 45초 뒤 가상 동네로 넘어간다. 그 전에 끝내도록 전체 40초, 서버 하나당 22초
        long deadline = System.currentTimeMillis() + 40_000;
        try {
            for (String ep : ENDPOINTS) {
                long left = deadline - System.currentTimeMillis();
                if (left < 5_000) break;
                try {
                    HttpRequest req = HttpRequest.newBuilder(URI.create(ep))
                            .timeout(Duration.ofMillis(Math.min(22_000, left)))
                            .header("Content-Type", "application/x-www-form-urlencoded")
                            .header("User-Agent", "BinaryWorld-Game/1.0 (+https://game.binaryworld.kr)")
                            .POST(HttpRequest.BodyPublishers.ofString("data=" + URLEncoder.encode(q, StandardCharsets.UTF_8)))
                            .build();
                    HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                    if (res.statusCode() == 200) {
                        JsonNode root = om.readTree(res.body());
                        if (root.has("elements")) return root;
                    }
                    last = new IOException(ep + " -> HTTP " + res.statusCode());
                } catch (IOException ex) {
                    last = ex;
                }
                log.warn("overpass failed: {}", last.getMessage());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted");
        } finally {
            upstream.release();
        }
        throw last != null ? last : new IOException("overpass failed");
    }
}
