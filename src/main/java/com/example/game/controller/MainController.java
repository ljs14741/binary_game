package com.example.game.controller;

import com.example.game.entity.User;
import com.example.game.service.UserService;
import com.example.game.service.VisitorService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;

@Controller
@Slf4j
public class MainController {

    @Autowired
    private VisitorService visitorService;

    @Autowired
    private UserService userService;
    @RequestMapping("/")
    public String main(Model model, HttpSession session,HttpServletRequest request) {
        // 채팅 조회

        if (session.isNew()) {
            visitorService.incrementVisitorCount("main");
        }

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
        return "main";
    }
}
