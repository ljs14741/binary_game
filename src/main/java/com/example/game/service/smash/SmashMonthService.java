package com.example.game.service.smash;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 이달의 랭킹 (회사·상사). 누적 표(smash_company·smash_boss)와 같은 값을 달별 표에 한 번 더 쌓는다.
 * 표는 처음 쓸 때 직접 만든다 (src/main/resources/db/smash_month.sql 과 같은 내용).
 *
 * <p>2026-11 에 처음 만들며, 판별 기록이 없어 그때까지의 누적을 11월 기록으로 넣었다 (10월 기록이 적어서 사용자 결정).
 * 이름·동네·숨김·상사 모습은 누적 표에서 가져온다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SmashMonthService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    /** 누적을 이달 기록으로 옮겨 넣는 건 처음 만든 달에만 */
    private static final int SEED_MONTH = 202611;

    private final JdbcTemplate jdbc;
    private volatile boolean ready;
    private volatile long triedAt;

    /** 한국 시간 기준 이번 달 (202611) */
    public static int monthKey() {
        LocalDate d = LocalDate.now(KST);
        return d.getYear() * 100 + d.getMonthValue();
    }

    /** 이번 달 숫자 (11) — 화면 탭 이름용 */
    public static int month() {
        return monthKey() % 100;
    }

    /** 표가 없으면 만들고, 처음 만든 달이면 누적을 옮겨 넣음. 실패하면 10분 뒤 다시 */
    boolean ensure() {
        if (ready) return true;
        if (System.currentTimeMillis() - triedAt < 600_000) return false;
        synchronized (this) {
            if (ready) return true;
            triedAt = System.currentTimeMillis();
            try {
                jdbc.execute("""
                        CREATE TABLE IF NOT EXISTS smash_company_month (
                          month_key int NOT NULL COMMENT '연월(202611)',
                          name_key varchar(60) NOT NULL COMMENT 'smash_company.name_key',
                          total_damage bigint NOT NULL DEFAULT 0,
                          play_count int NOT NULL DEFAULT 0,
                          player_count int NOT NULL DEFAULT 0,
                          PRIMARY KEY (month_key, name_key),
                          KEY idx_smash_company_month_rank (month_key, total_damage)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회사 부수기 3D 회사별 달 기록'
                        """);
                jdbc.execute("""
                        CREATE TABLE IF NOT EXISTS smash_boss_month (
                          month_key int NOT NULL COMMENT '연월(202611)',
                          label_key varchar(30) NOT NULL COMMENT 'smash_boss.label_key',
                          total_hits bigint NOT NULL DEFAULT 0,
                          play_count int NOT NULL DEFAULT 0,
                          player_count int NOT NULL DEFAULT 0,
                          PRIMARY KEY (month_key, label_key),
                          KEY idx_smash_boss_month_rank (month_key, total_hits)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회사 부수기 3D 상사별 달 기록'
                        """);
                if (monthKey() == SEED_MONTH) seed();
                ready = true;
            } catch (DataAccessException e) {
                log.warn("smash month tables failed: {}", e.getMessage());
            }
            return ready;
        }
    }

    /** 표가 비어 있을 때만 누적을 11월로 (다시 떠도 두 번 넣지 않음) */
    private void seed() {
        Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM smash_company_month", Integer.class);
        if (c != null && c == 0) {
            int n = jdbc.update("""
                    INSERT IGNORE INTO smash_company_month (month_key, name_key, total_damage, play_count, player_count)
                    SELECT ?, name_key, total_damage, play_count, player_count FROM smash_company
                    """, SEED_MONTH);
            log.info("smash month seeded companies: {}", n);
        }
        Integer b = jdbc.queryForObject("SELECT COUNT(*) FROM smash_boss_month", Integer.class);
        if (b != null && b == 0) {
            int n = jdbc.update("""
                    INSERT IGNORE INTO smash_boss_month (month_key, label_key, total_hits, play_count, player_count)
                    SELECT ?, label_key, total_hits, play_count, player_count FROM smash_boss
                    """, SEED_MONTH);
            log.info("smash month seeded bosses: {}", n);
        }
    }

    /** 회사 한 판 더하기 (누적 표와 같은 값). 실패해도 누적 기록은 그대로 */
    public void addCompany(String key, long damage, int playInc, int newPlayer) {
        if (!ensure()) return;
        try {
            jdbc.update("""
                    INSERT INTO smash_company_month (month_key, name_key, total_damage, play_count, player_count)
                    VALUES (?, ?, ?, 1, 1)
                    ON DUPLICATE KEY UPDATE total_damage = total_damage + VALUES(total_damage),
                                            play_count = play_count + ?,
                                            player_count = player_count + ?
                    """, monthKey(), key, damage, playInc, newPlayer);
        } catch (DataAccessException e) {
            log.warn("smash month company failed: {}", e.getMessage());
        }
    }

    /** 상사 한 판 더하기 */
    public void addBoss(String key, int hits, int playInc, int newPlayer) {
        if (!ensure()) return;
        try {
            jdbc.update("""
                    INSERT INTO smash_boss_month (month_key, label_key, total_hits, play_count, player_count)
                    VALUES (?, ?, ?, 1, 1)
                    ON DUPLICATE KEY UPDATE total_hits = total_hits + VALUES(total_hits),
                                            play_count = play_count + ?,
                                            player_count = player_count + ?
                    """, monthKey(), key, hits, playInc, newPlayer);
        } catch (DataAccessException e) {
            log.warn("smash month boss failed: {}", e.getMessage());
        }
    }

    /** 이달 회사 TOP. region 이 있으면 그 동네, 없고 sido 가 있으면 그 시·도 */
    public List<SmashRankService.Entry> topCompanies(int limit, String rawRegion, String rawSido) {
        if (!ensure()) return List.of();
        String reg = SmashRankService.region(rawRegion);
        String sido = reg == null && rawSido != null && rawSido.trim().matches("[가-힣]{2,4}") ? rawSido.trim() : null;
        String where = reg != null ? " AND c.region = ?" : sido != null ? " AND c.region LIKE ?" : "";
        List<Object> args = new ArrayList<>(List.of(monthKey(), SmashRankService.MIN_PLAYERS));
        if (reg != null) args.add(reg);
        if (sido != null) args.add(sido + " %");
        args.add(Math.max(1, Math.min(limit, 50)));
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT c.display_name, m.total_damage, m.play_count, m.player_count, c.region
                FROM smash_company_month m JOIN smash_company c ON c.name_key = m.name_key
                WHERE m.month_key = ? AND c.hidden = 0 AND m.player_count >= ?""" + where + """
                 ORDER BY m.total_damage DESC LIMIT ?
                """, args.toArray());
        List<SmashRankService.Entry> out = new ArrayList<>();
        int i = 0;
        for (Map<String, Object> r : rows) {
            out.add(new SmashRankService.Entry(++i, (String) r.get("display_name"), ((Number) r.get("total_damage")).longValue(),
                    ((Number) r.get("play_count")).intValue(), ((Number) r.get("player_count")).intValue(),
                    (String) r.get("region")));
        }
        return out;
    }

    /** 이달 상사 TOP */
    public List<SmashBossService.Entry> topBosses(int limit) {
        if (!ensure()) return List.of();
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT b.display_label, m.total_hits, m.play_count, m.player_count, b.look
                FROM smash_boss_month m JOIN smash_boss b ON b.label_key = m.label_key
                WHERE m.month_key = ? AND b.hidden = 0 AND m.player_count >= ?
                ORDER BY m.total_hits DESC LIMIT ?
                """, monthKey(), SmashRankService.MIN_PLAYERS, Math.max(1, Math.min(limit, 50)));
        List<SmashBossService.Entry> out = new ArrayList<>();
        int i = 0;
        for (Map<String, Object> r : rows) {
            out.add(new SmashBossService.Entry(++i, (String) r.get("display_label"), ((Number) r.get("total_hits")).longValue(),
                    ((Number) r.get("play_count")).intValue(), ((Number) r.get("player_count")).intValue(),
                    SmashBossService.parseLook((String) r.get("look"))));
        }
        return out;
    }
}
