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
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 회사 이름 → 장소 후보.
 *
 * <p>카카오 로컬 키워드 검색이 우선이다 (한국 회사 이름 검색이 정확하다).
 * 약관상 결과를 저장하면 안 되므로 캐시하지 않고 매번 실시간으로 부른다.
 * 카카오맵에 장소로 등록 안 된 회사가 많아 키워드 결과가 비면 네이버 지역 검색으로 한 번 더 찾는다
 * (네이버 플레이스에만 있는 회사가 많다. 2026-07 부터 NAVER API HUB(네이버 클라우드)로 옮겨감.
 * 하루 25,000건, 다 쓰면 그날은 건너뛴다).
 * 키가 없거나 앱에 카카오맵이 꺼져 있으면 OSM Nominatim 으로 대신 찾는다.
 * Nominatim 은 초당 1건 제한이라 전역으로 간격을 두고, 결과는 하루 캐시한다 (Nominatim 정책상 허용).
 */
@Slf4j
@Service
public class SmashPlaceService {

    /** company: 회사로 보이는 곳이면 true. 화면이 현수막·상사 첫마디·엔딩 문구를 회사용/그 밖으로 가른다 */
    public record Place(String name, String address, String category, double lat, double lng, boolean company) {
        public Place(String name, String address, String category, double lat, double lng) {
            this(name, address, category, lat, lng, false);
        }
    }

    public record Result(String source, List<Place> places) {
    }

    private final ObjectMapper om = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String kakaoKey;
    private volatile long kakaoOffUntil = 0;
    private final String naverId, naverSecret;
    private volatile long naverOffUntil = 0;
    private long lastNominatim = 0;
    private final Map<String, CachedPlaces> osmCache = new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, CachedPlaces> e) {
            return size() > 500;
        }
    };

    private record CachedPlaces(long at, List<Place> places) {
    }

    public SmashPlaceService(
            @Value("${smash.kakao-key:${KAKAO_REST_KEY:${spring.security.oauth2.client.registration.kakao.client-id:}}}") String kakaoKey,
            @Value("${smash.naver-id:${NAVER_CLIENT_ID:}}") String naverId,
            @Value("${smash.naver-secret:${NAVER_CLIENT_SECRET:}}") String naverSecret) {
        this.kakaoKey = kakaoKey == null ? "" : kakaoKey.trim();
        this.naverId = naverId == null ? "" : naverId.trim();
        this.naverSecret = naverSecret == null ? "" : naverSecret.trim();
    }

    public Result search(String query) throws IOException {
        String q = query.trim();
        if (!kakaoKey.isEmpty() && System.currentTimeMillis() > kakaoOffUntil) {
            try {
                return new Result("kakao", kakao(q));
            } catch (KakaoUnavailable e) {
                kakaoOffUntil = System.currentTimeMillis() + Duration.ofMinutes(10).toMillis();
                log.warn("kakao local unavailable, falling back to nominatim for 10m: {}", e.getMessage());
            } catch (IOException e) {
                log.warn("kakao local failed: {}", e.getMessage());
            }
        }
        return new Result("osm", nominatim(q));
    }

    public record Exit(int no, double lat, double lng) {
    }

    /**
     * 지하철역 출구 번호와 위치. 카카오는 "○○역 N번출구" 로 물어야 정확히 주므로 1~14번을 한꺼번에 묻는다.
     * 실시간 표시용이고 저장하지 않는다 (카카오 약관).
     */
    public List<Exit> exits(String station, double lat, double lng) {
        if (kakaoKey.isEmpty() || System.currentTimeMillis() < kakaoOffUntil) return List.of();
        String st = station.replaceAll("역$", "").trim();
        List<java.util.concurrent.CompletableFuture<Exit>> jobs = new ArrayList<>();
        for (int n = 1; n <= 14; n++) {
            final int no = n;
            String url = String.format(java.util.Locale.ROOT,
                    "https://dapi.kakao.com/v2/local/search/keyword.json?size=3&radius=900&x=%.6f&y=%.6f&query=%s",
                    lng, lat, URLEncoder.encode(st + "역 " + no + "번출구", StandardCharsets.UTF_8));
            HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5))
                    .header("Authorization", "KakaoAK " + kakaoKey).GET().build();
            jobs.add(http.sendAsync(req, HttpResponse.BodyHandlers.ofString()).thenApply(res -> {
                if (res.statusCode() != 200) return null;
                try {
                    return parseExit(om.readTree(res.body()), st, no);
                } catch (IOException e) {
                    return null;
                }
            }).exceptionally(e -> null));
        }
        List<Exit> out = new ArrayList<>();
        for (var j : jobs) {
            Exit e = j.join();
            if (e != null) out.add(e);
        }
        return out;
    }

    static Exit parseExit(JsonNode root, String station, int no) {
        for (JsonNode d : root.path("documents")) {
            String name = d.path("place_name").asText("");
            if (name.startsWith(station + "역") && name.endsWith(" " + no + "번출구") && d.path("category_name").asText("").contains("지하철출구")) {
                return new Exit(no, d.path("y").asDouble(), d.path("x").asDouble());
            }
        }
        return null;
    }

    static final class KakaoUnavailable extends IOException {
        KakaoUnavailable(String m) {
            super(m);
        }
    }

    /**
     * 장소(키워드) 검색과 주소 검색을 함께 부른다. 카카오맵에 장소로 등록되지 않은 회사도
     * 도로명·지번 주소를 치면 그 건물로 갈 수 있게. 주소처럼 생긴 검색어면 주소 결과를 위에 둔다.
     */
    private List<Place> kakao(String q) throws IOException {
        String enc = URLEncoder.encode(q, StandardCharsets.UTF_8);
        var kw = http.sendAsync(kakaoReq("https://dapi.kakao.com/v2/local/search/keyword.json?size=8&query=" + enc), HttpResponse.BodyHandlers.ofString());
        var ad = http.sendAsync(kakaoReq("https://dapi.kakao.com/v2/local/search/address.json?size=5&query=" + enc), HttpResponse.BodyHandlers.ofString());
        HttpResponse<String> res;
        try {
            res = kw.join();
        } catch (java.util.concurrent.CompletionException e) {
            throw new IOException("kakao " + e.getCause());
        }
        if (res.statusCode() == 401 || res.statusCode() == 403) throw new KakaoUnavailable("HTTP " + res.statusCode() + " " + res.body());
        if (res.statusCode() != 200) throw new IOException("kakao HTTP " + res.statusCode());
        List<Place> places = parseKakao(om.readTree(res.body()));
        List<Place> addrs = List.of();
        try {
            HttpResponse<String> ar = ad.join();
            if (ar.statusCode() == 200) addrs = parseKakaoAddress(om.readTree(ar.body()));
        } catch (java.util.concurrent.CompletionException e) {
            log.warn("kakao address failed: {}", e.getMessage());
        }
        // 카카오에 없는 회사는 네이버에서 한 번 더
        if (places.isEmpty() && !looksLikeAddress(q)) places = naver(q);
        return merge(looksLikeAddress(q) ? addrs : places, looksLikeAddress(q) ? places : addrs);
    }

    /** 네이버 지역 검색. 키가 없거나 하루 한도를 넘겼거나 실패하면 빈 목록 (카카오 결과만으로 간다) */
    private List<Place> naver(String q) {
        if (naverId.isEmpty() || naverSecret.isEmpty() || System.currentTimeMillis() < naverOffUntil) return List.of();
        String url = "https://naverapihub.apigw.ntruss.com/search/v1/local?display=5&query=" + URLEncoder.encode(q, StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5))
                .header("X-NCP-APIGW-API-KEY-ID", naverId).header("X-NCP-APIGW-API-KEY", naverSecret).GET().build();
        try {
            HttpResponse<String> res = send(req);
            if (res.statusCode() == 429) {
                // 하루 한도 초과: 한국 시간 자정까지 쉰다
                naverOffUntil = java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Seoul")).toLocalDate().plusDays(1)
                        .atStartOfDay(java.time.ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
                log.warn("naver local quota exceeded, off until midnight: {}", res.body());
                return List.of();
            }
            if (res.statusCode() == 401 || res.statusCode() == 403) {
                naverOffUntil = System.currentTimeMillis() + Duration.ofMinutes(10).toMillis();
                log.warn("naver local unauthorized: {}", res.body());
                return List.of();
            }
            if (res.statusCode() != 200) {
                log.warn("naver local HTTP {}", res.statusCode());
                return List.of();
            }
            return parseNaver(om.readTree(res.body()));
        } catch (IOException e) {
            log.warn("naver local failed: {}", e.getMessage());
            return List.of();
        }
    }

    /** 네이버 지역 검색 결과. 이름에 <b> 태그가 붙어 오고, 좌표는 경위도 × 1e7 정수 (경위도 그대로 와도 받는다) */
    static List<Place> parseNaver(JsonNode root) {
        List<Place> out = new ArrayList<>();
        for (JsonNode d : root.path("items")) {
            String name = d.path("title").asText("").replaceAll("<[^>]+>", "")
                    .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").trim();
            String addr = d.path("roadAddress").asText("");
            if (addr.isEmpty()) addr = d.path("address").asText("");
            String cat = d.path("category").asText("");
            double lng = d.path("mapx").asDouble(), lat = d.path("mapy").asDouble();
            if (lng > 1000) { lng /= 1e7; lat /= 1e7; }
            if (name.isEmpty() || lat < 33 || lat > 39 || lng < 124 || lng > 132) continue;
            int gt = cat.lastIndexOf('>');
            out.add(new Place(name, addr, gt >= 0 ? cat.substring(gt + 1).trim() : cat, lat, lng, looksLikeCompany(name, cat, "")));
        }
        return out;
    }

    private HttpRequest kakaoReq(String url) {
        return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(6))
                .header("Authorization", "KakaoAK " + kakaoKey).GET().build();
    }

    /** "관악대로 288", "관양동 1234-5", "흥안대로 427번길 38" 같은 모양 */
    static boolean looksLikeAddress(String q) {
        return q.matches(".*(로|길|동|가|리|읍|면)\\s*\\d.*") || q.matches(".*\\d+-\\d+.*") || q.matches(".*번길.*");
    }

    /** 앞 목록 우선, 뒤 목록에서 30m 안에 겹치는 곳은 뺀다. 최대 10개 */
    static List<Place> merge(List<Place> first, List<Place> second) {
        List<Place> out = new ArrayList<>(first);
        for (Place p : second) {
            boolean dup = false;
            for (Place o : out) {
                double dy = (p.lat() - o.lat()) * 110_574, dx = (p.lng() - o.lng()) * 88_000;
                if (Math.hypot(dx, dy) < 30) { dup = true; break; }
            }
            if (!dup) out.add(p);
        }
        return out.size() > 10 ? out.subList(0, 10) : out;
    }

    static List<Place> parseKakaoAddress(JsonNode root) {
        List<Place> out = new ArrayList<>();
        for (JsonNode d : root.path("documents")) {
            JsonNode road = d.path("road_address");
            String building = road.path("building_name").asText("").trim();
            String roadName = road.isObject() ? road.path("address_name").asText("") : "";
            String jibun = d.path("address").path("address_name").asText(d.path("address_name").asText(""));
            String name = !building.isEmpty() ? building : (!roadName.isEmpty() ? roadName : jibun);
            String addr = !roadName.isEmpty() && !name.equals(roadName) ? roadName : jibun;
            out.add(new Place(name, addr, "주소", d.path("y").asDouble(), d.path("x").asDouble()));
        }
        return out;
    }

    /** 회사 건물이 아닌 장소: 주차장·카페·음식점·편의점·주유소 */
    private static final java.util.Set<String> SKIP_GROUPS = java.util.Set.of("PK6", "CE7", "FD6", "CS2", "OL7");

    static List<Place> parseKakao(JsonNode root) {
        List<Place> all = new ArrayList<>(), kept = new ArrayList<>();
        for (JsonNode d : root.path("documents")) {
            Place p = kakaoPlace(d);
            all.add(p);
            if (!SKIP_GROUPS.contains(d.path("category_group_code").asText(""))) kept.add(p);
        }
        return kept.isEmpty() ? all : kept;
    }

    private static Place kakaoPlace(JsonNode d) {
        String addr = d.path("road_address_name").asText("");
        if (addr.isEmpty()) addr = d.path("address_name").asText("");
        String cat = d.path("category_name").asText("");
        int gt = cat.lastIndexOf('>');
        String name = d.path("place_name").asText();
        return new Place(name, addr, gt >= 0 ? cat.substring(gt + 1).trim() : cat,
                d.path("y").asDouble(), d.path("x").asDouble(), looksLikeCompany(name, cat, d.path("category_group_code").asText("")));
    }

    /*
     * 회사인지는 "회사가 아닌 게 분명한 곳"을 빼는 식으로 정한다.
     * 카카오는 회사를 찾아도 사옥 건물("부동산 > 빌딩")이나 지점·서비스센터로 돌려주는 일이 많아
     * "기업" 분류만 회사로 치면 네이버 그린팩토리도 회사가 아니게 된다.
     */
    /** 학교·유치원·관공서·관광지·숙박·문화시설·지하철역·병원·약국 */
    private static final java.util.Set<String> NOT_COMPANY_GROUPS = java.util.Set.of("SC4", "PS3", "PO3", "AT4", "AD5", "CT1", "SW8", "HP8", "PM9");
    private static final java.util.Set<String> NOT_COMPANY_TOPS = java.util.Set.of(
            "교육,학문", "사회,공공기관", "여행", "종교", "의료,건강", "문화,예술", "스포츠,레저", "교통,수송");

    static boolean looksLikeCompany(String name, String category, String groupCode) {
        if (name.contains("주식회사") || name.contains("(주)") || name.contains("㈜")) return true;
        if (NOT_COMPANY_GROUPS.contains(groupCode)) return false;
        int gt = category.indexOf('>');
        String top = (gt >= 0 ? category.substring(0, gt) : category).trim();
        if (NOT_COMPANY_TOPS.contains(top)) return false;
        return !(category.contains("주거시설") || category.contains("아파트"));
    }

    private List<Place> nominatim(String q) throws IOException {
        String k = q.toLowerCase();
        synchronized (osmCache) {
            CachedPlaces c = osmCache.get(k);
            if (c != null && System.currentTimeMillis() - c.at < Duration.ofDays(1).toMillis()) return c.places;
        }
        synchronized (this) {
            long wait = lastNominatim + 1100 - System.currentTimeMillis();
            if (wait > 0) {
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("interrupted");
                }
            }
            lastNominatim = System.currentTimeMillis();
        }
        String url = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&limit=8&accept-language=ko&q="
                + URLEncoder.encode(q, StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("User-Agent", "BinaryWorld-Game/1.0 (+https://game.binaryworld.kr)")
                .GET().build();
        HttpResponse<String> res = send(req);
        if (res.statusCode() != 200) throw new IOException("nominatim HTTP " + res.statusCode());
        List<Place> places = parseNominatim(om.readTree(res.body()));
        synchronized (osmCache) {
            osmCache.put(k, new CachedPlaces(System.currentTimeMillis(), places));
        }
        return places;
    }

    static List<Place> parseNominatim(JsonNode root) {
        List<Place> out = new ArrayList<>();
        for (JsonNode d : root) {
            String display = d.path("display_name").asText("");
            String name = d.path("name").asText("");
            if (name.isEmpty()) name = display.split(",")[0].trim();
            // display_name 은 "이름, 동, 구, 시, 우편번호, 대한민국" 순 — 뒤에서부터 주소로 쓴다
            String[] parts = display.split(",\\s*");
            StringBuilder addr = new StringBuilder();
            for (int i = parts.length - 1; i >= 1; i--) {
                String p = parts[i].trim();
                if (p.equals("대한민국") || p.matches("\\d{5}")) continue;
                if (addr.length() > 0) addr.append(' ');
                addr.append(p);
            }
            out.add(new Place(name, addr.toString(), d.path("type").asText(""),
                    d.path("lat").asDouble(), d.path("lon").asDouble(), "office".equals(d.path("category").asText(""))));
        }
        return out;
    }

    private HttpResponse<String> send(HttpRequest req) throws IOException {
        try {
            return http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted");
        }
    }
}
