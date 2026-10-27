package com.example.game.controller;

import com.example.game.service.smash.OsmConverter;
import com.example.game.service.smash.SmashBossService;
import com.example.game.service.smash.SmashAreaService;
import com.example.game.service.smash.SmashPlaceService;
import com.example.game.service.smash.SmashRankService;
import com.example.game.service.smash.SmashVWorldService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 회사 부수기 3D 의 검색·지도 API. 남의 공개 서버를 대신 부르는 자리라 IP 당 호출을 제한한다. */
@Slf4j
@RestController
@RequestMapping("/api/smash")
@RequiredArgsConstructor
public class SmashController {

    private final SmashPlaceService places;
    private final SmashAreaService areas;
    private final SmashVWorldService vworld;
    private final SmashRankService ranks;
    private final SmashBossService bosses;
    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam("q") String q, HttpServletRequest req) {
        String query = q == null ? "" : q.trim();
        if (query.isEmpty() || query.length() > 40) return ResponseEntity.badRequest().body(Map.of("error", "query"));
        if (!allow(req, "s", 80)) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "rate"));
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(places.search(query));
        } catch (IOException e) {
            log.warn("smash search failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("error", "upstream"));
        }
    }

    @GetMapping("/area")
    public ResponseEntity<?> area(@RequestParam("lat") double lat, @RequestParam("lng") double lng, HttpServletRequest req) {
        if (!(lat > -85 && lat < 85 && lng >= -180 && lng <= 180)) return ResponseEntity.badRequest().body(Map.of("error", "coord"));
        if (!allow(req, "a", 600)) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "rate"));
        try {
            OsmConverter.AreaData data = areas.area(lat, lng);
            return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(6))).body(data);
        } catch (IOException e) {
            log.warn("smash area failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("error", "upstream"));
        }
    }

    /** 항공사진 타일 (브이월드). 키를 숨기고 디스크에 캐시한다. 한 판에 수십 장을 받으니 한도를 넉넉히 */
    @GetMapping("/sat/{z}/{x}/{y}")
    public ResponseEntity<byte[]> sat(@PathVariable int z, @PathVariable int x, @PathVariable int y, HttpServletRequest req) {
        if (!vworld.enabled()) return ResponseEntity.notFound().build();
        if (!allow(req, "i", 3000)) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        try {
            return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
                    .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic()).body(vworld.satTile(z, x, y));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (IOException e) {
            log.warn("smash sat failed {}/{}/{}: {}", z, x, y, e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    /** 지하철 출구 번호 (카카오 실시간 조회, 저장·캐시 안 함) */
    @GetMapping("/exits")
    public ResponseEntity<?> exits(@RequestParam("station") String station, @RequestParam("lat") double lat, @RequestParam("lng") double lng, HttpServletRequest req) {
        String st = station == null ? "" : station.trim();
        if (st.isEmpty() || st.length() > 20 || !(lat > -85 && lat < 85)) return ResponseEntity.badRequest().body(Map.of("error", "param"));
        if (!allow(req, "e", 30)) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "rate"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(places.exits(st, lat, lng));
    }

    /** bossName·bossTitle 은 상사 꾸미기 값, bossHits 는 이번 판 상사 날린 횟수. 회사 없이 상사만 와도 됨 */
    public record PlayReq(String company, long damage, int seconds, String bossName, String bossTitle, int bossHits) {
    }

    /**
     * 한 판 기록. 회사 이름은 사용자가 입력한 그대로만 받음 (카카오 장소 정보는 안 받음).
     * 상사는 이름 + 직함으로 따로 쌓고 회사와는 묶지 않음
     */
    @PostMapping("/plays")
    public ResponseEntity<?> play(@RequestBody PlayReq body, HttpServletRequest req) {
        if (body == null || (body.company() == null && body.bossTitle() == null)) return ResponseEntity.badRequest().body(Map.of("error", "param"));
        if (!allow(req, "p", 30)) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "rate"));
        String ip = clientIp(req);
        if (body.bossTitle() != null && body.bossHits() > 0) {
            // 상사 랭킹이 안 돼도 회사 기록은 남게
            try {
                bosses.submit(body.bossName(), body.bossTitle(), body.bossHits(), body.seconds(), ip);
            } catch (DataAccessException e) {
                log.warn("smash boss submit failed: {}", e.getMessage());
            }
        }
        Object out = body.company() == null ? Map.of("counted", false) : ranks.submit(body.company(), body.damage(), body.seconds(), ip);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(out);
    }

    /** 누적 랭킹 TOP N (회사·상사), company 를 주면 그 회사의 누적·순위도 */
    @GetMapping("/rankings")
    public ResponseEntity<?> rankings(@RequestParam(value = "company", required = false) String company,
                                      @RequestParam(value = "limit", defaultValue = "10") int limit) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("top", ranks.top(limit));
        out.put("bosses", bossTop(limit));
        out.put("minPlayers", SmashRankService.MIN_PLAYERS);
        if (company != null && !company.isBlank()) out.put("company", ranks.status(company));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(20))).body(out);
    }

    private List<SmashBossService.Entry> bossTop(int limit) {
        try {
            return bosses.top(limit);
        } catch (DataAccessException e) {
            log.warn("smash boss top failed: {}", e.getMessage());
            return List.of();
        }
    }

    private static String clientIp(HttpServletRequest req) {
        String fwd = req.getHeader("X-Forwarded-For");
        return fwd != null && !fwd.isBlank() ? fwd.split(",")[0].trim() : req.getRemoteAddr();
    }

    /** 10분 창에 limit 건. */
    private boolean allow(HttpServletRequest req, String kind, int limit) {
        String fwd = req.getHeader("X-Forwarded-For");
        String ip = fwd != null && !fwd.isBlank() ? fwd.split(",")[0].trim() : req.getRemoteAddr();
        long now = System.currentTimeMillis();
        long from = now - Duration.ofMinutes(10).toMillis();
        if (hits.size() > 5000) hits.entrySet().removeIf(e -> e.getValue().isEmpty() || e.getValue().peekLast() < from);
        Deque<Long> q = hits.computeIfAbsent(kind + ip, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst() < from) q.pollFirst();
            if (q.size() >= limit) return false;
            q.addLast(now);
            return true;
        }
    }
}
