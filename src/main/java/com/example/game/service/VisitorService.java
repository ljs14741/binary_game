package com.example.game.service;

import com.example.game.dto.VisitorDTO;
import com.example.game.entity.DailyVisitor;
import com.example.game.entity.TotalVisitor;
import com.example.game.repository.DailyVisitorRepository;
import com.example.game.repository.TotalVisitorRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
@RequiredArgsConstructor
public class VisitorService {

    private final DailyVisitorRepository dailyVisitorRepository;
    private final TotalVisitorRepository totalVisitorRepository;

    public void countVisitIfNeeded(HttpServletRequest request, HttpServletResponse response, String pageName) {
        if (isBot(request.getHeader("User-Agent"))) {
            return;
        }

        if (!hasVisitedToday(request)) {
            recordVisit(pageName);
            setVisitedCookie(response);
        }
    }

    private boolean hasVisitedToday(HttpServletRequest request) {
        if (request.getCookies() == null) return false;
        for (Cookie cookie : request.getCookies()) {
            if ("visited".equals(cookie.getName())) {
                return true;
            }
        }
        return false;
    }

    private void setVisitedCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie("visited", "Y");
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime midnight = now.plusDays(1).truncatedTo(ChronoUnit.DAYS);
        long secondsUntilMidnight = Duration.between(now, midnight).getSeconds();

        cookie.setMaxAge((int) secondsUntilMidnight);
        cookie.setPath("/");
        response.addCookie(cookie);
    }

    private boolean isBot(String userAgent) {
        if (userAgent == null) return false;
        String ua = userAgent.toLowerCase();
        return ua.contains("googlebot") || ua.contains("bingbot") ||
                ua.contains("slurp") || ua.contains("duckduckbot") ||
                ua.contains("baiduspider") || ua.contains("yandexbot") ||
                ua.contains("sogou") || ua.contains("exabot") ||
                ua.contains("facebot") || ua.contains("ia_archiver") ||
                ua.contains("naverbot") || ua.contains("daum") ||
                ua.contains("mj12bot") || ua.contains("ahrefsbot");
    }

    @Transactional
    public VisitorDTO recordVisit(String pageName) {
        LocalDate today = LocalDate.now();

        DailyVisitor dailyVisitor = dailyVisitorRepository.findByPageNameAndDate(pageName, today)
                .orElseGet(() -> DailyVisitor.builder()
                        .pageName(pageName)
                        .date(today)
                        .visitCount(0)
                        .build());
        dailyVisitor.setVisitCount(dailyVisitor.getVisitCount() + 1);
        dailyVisitorRepository.save(dailyVisitor);

        TotalVisitor totalVisitor = totalVisitorRepository.findByPageName(pageName)
                .orElseGet(() -> TotalVisitor.builder()
                        .pageName(pageName)
                        .totalCount(0L)
                        .build());
        totalVisitor.setTotalCount(totalVisitor.getTotalCount() + 1);
        totalVisitorRepository.save(totalVisitor);

        return VisitorDTO.builder()
                .pageName(pageName)
                .date(today.toString())
                .dailyCount(dailyVisitor.getVisitCount())
                .totalCount(totalVisitor.getTotalCount())
                .build();
    }

    public List<DailyVisitor> getTodayAllVisitors() {
        return dailyVisitorRepository.findAll().stream()
                .filter(d -> d.getDate().equals(LocalDate.now()))
                .toList();
    }

    public List<TotalVisitor> getAllTotalVisitors() {
        return totalVisitorRepository.findAll();
    }
}