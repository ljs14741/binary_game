package com.example.game.controller;

import com.example.game.service.VisitorService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@RequiredArgsConstructor
@Slf4j
public class MainController {
    private final VisitorService visitorService;

    @GetMapping("/")
    public String index(HttpServletRequest request, HttpServletResponse response) {
        visitorService.countVisitIfNeeded(request, response, "game");
        return "main";
    }

    @GetMapping("/about")
    public String about() {
        return "common/about";
    }

    @GetMapping("/privacy-policy")
    public String privacyPolicy() {
        return "common/privacy-policy";
    }

    @GetMapping("/contact")
    public String contact() {
        return "common/contact";
    }
}
