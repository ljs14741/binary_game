package com.example.game.game.controller;

import com.example.game.game.dto.GameDTO;
import com.example.game.game.entity.Game;
import com.example.game.entity.User;
import com.example.game.game.service.GameService;
import com.example.game.service.UserService;
import com.example.game.service.VisitorService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.List;
import java.util.Map;

@Controller
@Slf4j
@RequiredArgsConstructor
public class GameController {

    @Autowired
    private GameService gameService;

    @Autowired
    UserService userService;

    private final VisitorService visitorService;

    @GetMapping("/dodge")
    public String dodge(Model model, HttpSession session) {
        visitorService.incrementVisitorCount("dodge");
        List<Game> games = gameService.getTopScoresForAvoidingGame();

        //유저id
        Long kakaoId = (Long) session.getAttribute("kakaoId");
        User user = null;
        if(kakaoId != null) {
            user = userService.findById(kakaoId);
        }
        if (user == null) {  // user가 여전히 null이면 새로운 User 객체를 생성
            user = new User();
            user.setChangeNickname("비로그인유저");
        }

        model.addAttribute("user", user);
        model.addAttribute("games", games);
        return "game/dodge";
    }

    @GetMapping("/kimchi")
    public String kimchi(Model model, HttpSession session) {
        visitorService.incrementVisitorCount("kimchi");

        List<Game> games = gameService.getTopScoresForDefenseGame();

        //유저id
        Long kakaoId = (Long) session.getAttribute("kakaoId");
        User user = null;
        if(kakaoId != null) {
            user = userService.findById(kakaoId);
        }
        if (user == null) {  // user가 여전히 null이면 새로운 User 객체를 생성
            user = new User();
            user.setChangeNickname("비로그인유저");
        }

        model.addAttribute("user", user);
        model.addAttribute("games", games);
        return "game/kimchi";
    }

    @GetMapping("/omokGame")
    public String omokGame(Model model, HttpSession session) {

        return "game/omokGame";
    }

    @PostMapping("/save")
    @ResponseBody
    public List<Game> saveGame(@RequestBody GameDTO gameDTO, HttpSession session) {
        gameService.saveGame(gameDTO, session);
        return gameService.getTopScoresByGameName(gameDTO.getGameName()); // 저장한 게임의 최신 순위를 반환
    }

    // 오목 Gemini API 호출
    @PostMapping("/api/gemini/move")
    @ResponseBody
    public Map<String, Object> getGeminiMove(@RequestBody Map<String, Object> requestBody) {
        log.info("Received request body from client: {}", requestBody);

        List<List<String>> boardState = (List<List<String>>) requestBody.get("boardState");
        Boolean firstMoveObj = (Boolean) requestBody.get("firstMove");
        boolean firstMove = firstMoveObj != null && firstMoveObj;
        Boolean playerFirstObj = (Boolean) requestBody.get("playerFirst");
        boolean playerFirst = playerFirstObj != null && playerFirstObj;
        Map<String, Integer> playerMove = (Map<String, Integer>) requestBody.get("playerMove");

        log.info("Parsed board state: {}", boardState);
        log.info("First move: {}", firstMove);
        log.info("Player first: {}", playerFirst);
        log.info("Player move: {}", playerMove);

        return gameService.getGeminiMove(boardState, firstMove, playerFirst, playerMove);
    }
}