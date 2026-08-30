package com.example.game.controller;

import com.example.game.dto.GameScoreDTO;
import com.example.game.service.GameService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Map;

@Controller
@Slf4j
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;

    @GetMapping("/dodge")
    public String dodge(Model model, HttpSession session) {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        YearMonth thisMonth = YearMonth.now(seoul);

        model.addAttribute("hallOfFame", gameService.hallOfFameTop10());
        model.addAttribute("monthly", gameService.monthlyTop30(thisMonth, seoul));
        model.addAttribute("currentMonth", thisMonth);

        return "game/dodge";
    }

    @GetMapping("/kimchi")
    public String kimchi(Model model, HttpSession session) {
        return "game/kimchi";
    }

    @GetMapping("/ladder")
    public String ladder(Model model, HttpSession session) {
        return "game/ladder";
    }

    @GetMapping("/pinball")
    public String pinball(Model model, HttpSession session) {
        return "game/pinball";
    }

    @GetMapping("/horserace")
    public String horserace(Model model, HttpSession session) {
        return "game/horserace";
    }

    @GetMapping("/mugunghwa")
    public String mugunghwa(Model model, HttpSession session) {
        return "game/mugunghwa";
    }

    @GetMapping("/wasabi")
    public String wasabi(Model model, HttpSession session) {
        return "game/wasabi";
    }

    @GetMapping("/omokGame")
    public String omokGame(Model model, HttpSession session) {

        return "game/omokGame";
    }

    /** 점수 저장 API (게임오버 시 자동 호출) */
    @PostMapping("/api/scores")
    @ResponseBody
    public ResponseEntity<GameScoreDTO> submitScore(@RequestBody GameScoreDTO req) {
        return ResponseEntity.ok(gameService.save(req));
    }

    /** 랭킹 페이지: 명예의 전당 Top10 + 이번 달 Top30 */
    @GetMapping("/dodge/ranking")
    public String dodgeRanking(Model model) {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        YearMonth thisMonth = YearMonth.now(seoul);

        model.addAttribute("hallOfFame", gameService.hallOfFameTop10());
        model.addAttribute("monthly", gameService.monthlyTop30(thisMonth, seoul));
        model.addAttribute("currentMonth", thisMonth);

        return "game/dodge";
    }

    @GetMapping("/api/scores/leaderboards")
    @ResponseBody
    public Map<String, Object> leaderboards() {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        YearMonth thisMonth = YearMonth.now(seoul);
        return Map.of(
                "hallOfFame", gameService.hallOfFameTop10(),
                "monthly",    gameService.monthlyTop30(thisMonth, seoul),
                "currentMonth", thisMonth.toString()
        );
    }
}