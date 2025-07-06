package com.example.game.controller;

import com.example.game.entity.DailyVisitor;
import com.example.game.entity.TotalVisitor;
import com.example.game.service.VisitorService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/visit")
@RequiredArgsConstructor
public class VisitorController {

    private final VisitorService visitorService;

    @GetMapping("/today")
    public List<DailyVisitor> getTodayVisitors() {
        return visitorService.getTodayAllVisitors();
    }

    @GetMapping("/total")
    public List<TotalVisitor> getTotalVisitors() {
        return visitorService.getAllTotalVisitors();
    }
}