package com.example.game.repository;

import com.example.game.entity.GameScore;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface GameRepository extends JpaRepository<GameScore, Long> {

    // 명예의 전당 Top10 (닉네임 중복 허용)
    List<GameScore> findAllByOrderByScoreDescCreatedAtAscIdAsc(Pageable pageable);

    // 월간 Top30 (해당 월 범위, 닉네임 중복 허용)
    @Query("""
            SELECT g FROM game_score g
            WHERE g.createdAt >= :start AND g.createdAt < :end
            ORDER BY g.score DESC, g.createdAt ASC, g.id ASC
            """)
    List<GameScore> findMonthly(@Param("start") LocalDateTime start,
                                @Param("end") LocalDateTime end,
                                Pageable pageable);
}
