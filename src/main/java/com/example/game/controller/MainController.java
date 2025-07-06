package com.example.game.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@Slf4j
public class MainController {

    @RequestMapping("/")
    public String main() {
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
