package com.example.game.game.controller;

import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class pinballGameController {

    @GetMapping("/pinball")
    public String pinball(Model model, HttpSession session) {
        return "game/pinball";
    }
}
