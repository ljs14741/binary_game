package com.example.game.service.smash;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 회사별 누적 피해액 랭킹 (smash_company, src/main/resources/db/smash_company.sql).
 *
 * <p>피해액은 화면이 계산해 보내는 값이라 믿을 수 없다. 한 판 상한·초당 상한을 걸고,
 * 같은 사람(IP 해시)은 하루 기록 수를 제한한다. 한 사람만 부숴도 랭킹에 보인다 (2026-10 결정: 초반엔 랭킹이 비어 보이는 게 더 손해).
 * 그 대신 사람 이름·욕 같은 장난 이름은 금칙어로 거르고, 남은 것은 hidden 으로 숨긴다.
 */
@Service
@RequiredArgsConstructor
public class SmashRankService {

    /** 랭킹에 보이려면 서로 다른 사람이 이만큼 부숴야 한다. 장난 이름이 문제 되면 2 로 올린다 */
    public static final int MIN_PLAYERS = 1;
    /** 한 판 최대 피해액(억). 초고층 + 퇴사 버튼을 여러 번 써도 이 안에 든다 */
    static final long MAX_DAMAGE = 60_000;
    /** 초당 최대 피해액(억). 퇴사 버튼 한 방이 1조 안팎이라 넉넉히 */
    static final long MAX_PER_SECOND = 3_000;
    static final int MAX_PLAYS_PER_DAY = 40;

    private static final List<String> BANNED = List.of(
            "씨발", "시발", "ㅅㅂ", "병신", "ㅂㅅ", "개새", "좆", "존나", "fuck", "shit", "sex", "섹스", "보지", "자지", "니미", "느금", "애미", "애비",
            "새끼", "지랄", "꺼져", "죽어", "자살", "살인", "일베", "메갈", "한남", "김치녀");

    private final JdbcTemplate jdbc;
    private final Map<String, Integer> playsToday = new ConcurrentHashMap<>();
    private final Set<String> seenToday = ConcurrentHashMap.newKeySet();
    private volatile LocalDate day = LocalDate.now();

    public record Entry(int rank, String name, long damage, int plays, int players) {
    }

    public record Submit(boolean counted, String name, long totalDamage, int plays, int players, Integer rank, String reason) {
    }

    /** 묶음용 이름: ㈜·주식회사·괄호·공백·기호를 빼고 소문자로. "(주)삼성 전자" = "삼성전자" */
    static String nameKey(String name) {
        String s = name.toLowerCase(Locale.ROOT)
                .replace("㈜", "").replace("(주)", "").replace("주식회사", "").replace("(유)", "").replace("유한회사", "");
        return s.replaceAll("[\\s\\p{Punct}·ㆍ「」『』【】<>]", "");
    }

    static String clean(String name) {
        if (name == null) return "";
        return name.replaceAll("[\\p{Cntrl}<>\"'`]", "").replaceAll("\\s+", " ").trim();
    }

    static boolean allowedName(String display, String key) {
        if (key.length() < 2 || key.length() > 30 || display.length() > 30) return false;
        if (key.matches("\\d+") || key.contains("http") || key.contains("www")) return false;
        return !banned(key);
    }

    /** 금칙어 들었는지 (상사 랭킹도 같이 씀) */
    static boolean banned(String key) {
        for (String b : BANNED) if (key.contains(b)) return true;
        return false;
    }

    /** 화면이 보낸 피해액을 상한으로 자른다 */
    static long plausible(long damage, int seconds) {
        long d = Math.max(0, damage);
        d = Math.min(d, MAX_DAMAGE);
        d = Math.min(d, (long) Math.max(seconds, 1) * MAX_PER_SECOND);
        return d;
    }

    public Submit submit(String rawName, long damage, int seconds, String ip) {
        rollDay();
        String display = clean(rawName);
        if (display.length() > 30) display = display.substring(0, 30);
        String key = nameKey(display);
        if (!allowedName(display, key)) return new Submit(false, display, 0, 0, 0, null, "name");
        if (seconds < 15) return new Submit(false, display, 0, 0, 0, null, "short");
        String who = hash(ip);
        if (playsToday.merge(who, 1, Integer::sum) > MAX_PLAYS_PER_DAY) return new Submit(false, display, 0, 0, 0, null, "limit");
        long d = plausible(damage, seconds);
        int newPlayer = seenToday.add(who + "|" + key) ? 1 : 0;
        // 있으면 더하고 없으면 만든다 — 한 문장이라 동시에 들어와도 안전
        jdbc.update("""
                INSERT INTO smash_company (name_key, display_name, total_damage, play_count, player_count)
                VALUES (?, ?, ?, 1, 1)
                ON DUPLICATE KEY UPDATE total_damage = total_damage + VALUES(total_damage),
                                        play_count = play_count + 1,
                                        player_count = player_count + ?
                """, key, display.length() > 40 ? display.substring(0, 40) : display, d, newPlayer);
        return status(key, true);
    }

    /** 이 회사의 누적과 (보이는 회사 중) 순위 */
    public Submit status(String rawName) {
        return status(nameKey(clean(rawName)), false);
    }

    private Submit status(String key, boolean counted) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT display_name, total_damage, play_count, player_count, hidden FROM smash_company WHERE name_key = ?", key);
        if (rows.isEmpty()) return new Submit(counted, null, 0, 0, 0, null, null);
        Map<String, Object> r = rows.get(0);
        long total = ((Number) r.get("total_damage")).longValue();
        int players = ((Number) r.get("player_count")).intValue();
        Object h = r.get("hidden");
        boolean hidden = h instanceof Boolean bo ? bo : h instanceof Number n && n.intValue() != 0;
        Integer rank = null;
        if (!hidden && players >= MIN_PLAYERS) {
            Integer above = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM smash_company WHERE hidden = 0 AND player_count >= ? AND total_damage > ?", Integer.class, MIN_PLAYERS, total);
            rank = (above == null ? 0 : above) + 1;
        }
        return new Submit(counted, (String) r.get("display_name"), total, ((Number) r.get("play_count")).intValue(), players, rank, null);
    }

    public List<Entry> top(int limit) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT display_name, total_damage, play_count, player_count FROM smash_company
                WHERE hidden = 0 AND player_count >= ?
                ORDER BY total_damage DESC LIMIT ?
                """, MIN_PLAYERS, Math.max(1, Math.min(limit, 50)));
        java.util.ArrayList<Entry> out = new java.util.ArrayList<>();
        int i = 0;
        for (Map<String, Object> r : rows) {
            out.add(new Entry(++i, (String) r.get("display_name"), ((Number) r.get("total_damage")).longValue(),
                    ((Number) r.get("play_count")).intValue(), ((Number) r.get("player_count")).intValue()));
        }
        return out;
    }

    private void rollDay() {
        LocalDate now = LocalDate.now();
        if (!now.equals(day)) {
            day = now;
            playsToday.clear();
            seenToday.clear();
        }
    }

    /** IP 는 그대로 두지 않는다. 메모리에만, 해시로 */
    static String hash(String ip) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(("smash|" + ip).getBytes(StandardCharsets.UTF_8))).substring(0, 24);
        } catch (Exception e) {
            return String.valueOf(ip.hashCode());
        }
    }

}
