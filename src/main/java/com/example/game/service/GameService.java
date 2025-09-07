package com.example.game.service;

import com.example.game.dto.GameScoreDTO;
import com.example.game.entity.GameScore;
import com.example.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;

import static java.util.stream.Collectors.toList;

@Service
@RequiredArgsConstructor
public class GameService {
    private final GameRepository gameRepository;

    public GameScoreDTO save(GameScoreDTO req) {
        String nick = (req.getNickname() == null) ? "" : req.getNickname().trim();
        if (nick.isEmpty()) throw new IllegalArgumentException("nickname empty");
        if (nick.length() > 10) nick = nick.substring(0, 10);
        int score = Math.max(0, req.getScore() == null ? 0 : req.getScore());

        GameScore saved = gameRepository.save(GameScore.builder()
                .nickname(nick)
                .score(score)
                .build());

        return GameScoreDTO.builder()
                .id(saved.getId())
                .nickname(saved.getNickname())
                .score(saved.getScore())
                .build();
    }

    public java.util.List<GameScoreDTO> hallOfFameTop10() {
        return gameRepository.findAllByOrderByScoreDescCreatedAtAscIdAsc(PageRequest.of(0, 10))
                .stream().map(g -> new GameScoreDTO(g.getId(), g.getNickname(), g.getScore()))
                .collect(toList());
    }

    public java.util.List<GameScoreDTO> monthlyTop30(YearMonth ym, ZoneId zone) {
        LocalDateTime start = ym.atDay(1).atStartOfDay(zone).toLocalDateTime();
        LocalDateTime end   = ym.plusMonths(1).atDay(1).atStartOfDay(zone).toLocalDateTime();
        return gameRepository.findMonthly(start, end, PageRequest.of(0, 30))
                .stream().map(g -> new GameScoreDTO(g.getId(), g.getNickname(), g.getScore()))
                .collect(toList());
    }
}
