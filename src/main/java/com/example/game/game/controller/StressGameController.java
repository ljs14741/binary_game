package com.example.game.game.controller;

import com.example.game.entity.User;
import com.example.game.game.entity.Game;
import com.example.game.game.service.StressGameService;
import com.example.game.service.UserService;
import com.example.game.service.VisitorService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.util.List;

@Controller
@Slf4j
@RequiredArgsConstructor
public class StressGameController {

    private final StressGameService stressGameService;

    private final UserService userService;

    private final VisitorService visitorService;

    @GetMapping("/stressGame")
    public String stressGame(Model model, HttpSession session) {
        visitorService.incrementVisitorCount("stressGame");

        List<Game> games = stressGameService.getTopScoresForAvoidingStressGame();

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
        return "game/stressGame";
    }
}
