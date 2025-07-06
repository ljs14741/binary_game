package com.example.game.controller;

import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@Slf4j
@RequiredArgsConstructor
public class GameController {

    @GetMapping("/dodge")
    public String dodge(Model model, HttpSession session) {
        return "game/dodge";
    }

    @GetMapping("/kimchi")
    public String kimchi(Model model, HttpSession session) {
        return "game/kimchi";
    }

    @GetMapping("/pinball")
    public String pinball(Model model, HttpSession session) {
        return "game/pinball";
    }

    @GetMapping("/omokGame")
    public String omokGame(Model model, HttpSession session) {

        return "game/omokGame";
    }
}