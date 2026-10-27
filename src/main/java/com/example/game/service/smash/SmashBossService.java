package com.example.game.service.smash;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 상사별 누적 날린 횟수 랭킹 (smash_boss, src/main/resources/db/smash_boss.sql).
 *
 * <p>상사는 이름 + 직함으로 쌓음 ("김철수 부장님"). 회사 이름과는 묶어 저장하지 않음
 * (어느 회사 누구인지는 안 드러나게).
 * 손대지 않은 기본 상사("사장님")는 모두 같은 이름이라 늘 1위가 되니 뺌.
 * 날린 횟수는 화면이 세서 보내는 값이라 한 판·초당 상한을 걺 (상사는 맞고 0.3초 동안 다시 안 맞음).
 */
@Service
@RequiredArgsConstructor
public class SmashBossService {

    /** 한 판 최대 날린 횟수 */
    static final int MAX_HITS = 600;
    /** 초당 최대 날린 횟수. 맞은 뒤 0.3초 쉬니 초당 3번 남짓 */
    static final int MAX_HITS_PER_SECOND = 4;
    static final int MAX_PLAYS_PER_DAY = 40;
    static final int MAX_TITLE = 8;
    /** 상사 꾸미기 이름 칸 maxlength 와 맞춤 */
    static final int MAX_NAME = 6;
    /** 기본 상사 직함 (main.js 의 BOSS_DEFAULT) */
    static final String DEFAULT_TITLE = "사장님";

    /** 회사 금칙어에 더해 상사 이름에만 거르는 말 (main.js 의 BAD_WORDS 와 맞춤) */
    private static final List<String> BANNED_EXTRA = List.of(
            "씨빨", "ㅆㅂ", "ㅅ발", "씹", "븅신", "개색", "색기", "섀끼", "쌔끼", "미친", "또라이", "닥쳐", "뒤져", "뒈져", "엿먹", "썅", "염병", "등신", "호로",
            "걸레", "창녀", "틀딱", "bitch");

    private final JdbcTemplate jdbc;
    private final Map<String, Integer> playsToday = new ConcurrentHashMap<>();
    private final Set<String> seenToday = ConcurrentHashMap.newKeySet();
    private volatile LocalDate day = LocalDate.now();

    public record Entry(int rank, String name, long hits, int plays, int players) {
    }

    /** 화면 표시 이름: 이름 + 직함 */
    static String label(String rawName, String rawTitle) {
        String title = SmashRankService.clean(rawTitle);
        if (title.length() > MAX_TITLE) title = title.substring(0, MAX_TITLE).trim();
        String name = SmashRankService.clean(rawName).replace(" ", "");
        if (name.codePointCount(0, name.length()) > MAX_NAME) name = name.substring(0, name.offsetByCodePoints(0, MAX_NAME));
        if (title.isEmpty()) return name;
        return name.isEmpty() ? title : name + " " + title;
    }

    /** 묶음용 이름: 공백·기호 빼고 소문자로, 끝의 "님"도 뺌. "김 부장님" = "김부장" */
    static String labelKey(String label) {
        String s = label.toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Punct}·ㆍ「」『』【】<>]", "");
        return s.endsWith("님") ? s.substring(0, s.length() - 1) : s;
    }

    /** 랭킹에 올릴 수 있는지. 기본 상사("사장님" 그대로)는 뺌 */
    static boolean allowedLabel(String key) {
        if (key.length() < 2 || key.length() > 20) return false;
        if (key.equals(labelKey(DEFAULT_TITLE))) return false;
        if (key.matches("\\d+") || key.contains("http") || key.contains("www")) return false;
        // 숫자 끼워 넣은 욕("ㅅ1발")도 걸리게 숫자 빼고 한 번 더 봄
        String bare = key.replaceAll("\\d", "");
        if (SmashRankService.banned(key) || SmashRankService.banned(bare)) return false;
        for (String b : BANNED_EXTRA) if (bare.contains(b)) return false;
        return true;
    }

    /** 화면이 보낸 날린 횟수를 상한으로 자름 */
    static int plausible(int hits, int seconds) {
        int h = Math.max(0, hits);
        h = Math.min(h, MAX_HITS);
        h = Math.min(h, Math.max(seconds, 1) * MAX_HITS_PER_SECOND);
        return h;
    }

    /** 한 판 기록. 올렸으면 true */
    public boolean submit(String rawName, String rawTitle, int hits, int seconds, String ip) {
        rollDay();
        if (seconds < 15) return false;
        int h = plausible(hits, seconds);
        if (h < 1) return false;
        String display = label(rawName, rawTitle);
        String key = labelKey(display);
        if (!allowedLabel(key)) return false;
        String who = SmashRankService.hash(ip);
        if (playsToday.merge(who, 1, Integer::sum) > MAX_PLAYS_PER_DAY) return false;
        int newPlayer = seenToday.add(who + "|" + key) ? 1 : 0;
        jdbc.update("""
                INSERT INTO smash_boss (label_key, display_label, total_hits, play_count, player_count)
                VALUES (?, ?, ?, 1, 1)
                ON DUPLICATE KEY UPDATE total_hits = total_hits + VALUES(total_hits),
                                        play_count = play_count + 1,
                                        player_count = player_count + ?
                """, key, display, h, newPlayer);
        return true;
    }

    public List<Entry> top(int limit) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT display_label, total_hits, play_count, player_count FROM smash_boss
                WHERE hidden = 0 AND player_count >= ?
                ORDER BY total_hits DESC LIMIT ?
                """, SmashRankService.MIN_PLAYERS, Math.max(1, Math.min(limit, 50)));
        List<Entry> out = new ArrayList<>();
        int i = 0;
        for (Map<String, Object> r : rows) {
            out.add(new Entry(++i, (String) r.get("display_label"), ((Number) r.get("total_hits")).longValue(),
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
}
