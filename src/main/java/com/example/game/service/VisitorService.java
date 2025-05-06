package com.example.game.service;

import com.example.game.dto.VisitorDTO;
import com.example.game.entity.Visitor;
import com.example.game.repository.VisitorRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Optional;

@Service
public class VisitorService {
    @Autowired
    private VisitorRepository visitorRepository;

    @PostConstruct
    public void init() {
        String defaultPageName = "main";
        LocalDate today = LocalDate.now();
        Optional<Visitor> optionalVisitor = visitorRepository.findByPageNameAndDate(defaultPageName, today);
        if (!optionalVisitor.isPresent()) {
            Visitor visitor = new Visitor(defaultPageName);
            visitorRepository.save(visitor);
        }
    }

    public void incrementVisitorCount(String pageName) {
        LocalDate today = LocalDate.now();
        Visitor visitor = visitorRepository.findByPageNameAndDate(pageName, today)
                .orElse(new Visitor(pageName));
        visitor.setDailyCount(visitor.getDailyCount() + 1);
        visitor.setTotalCount(visitor.getTotalCount() + 1);
        visitorRepository.save(visitor);
    }

    public VisitorDTO getVisitorCount() {
        LocalDate today = LocalDate.now();
        Optional<Visitor> optionalVisitor = visitorRepository.findByPageNameAndDate("main", today);
        Visitor visitor = optionalVisitor.orElse(new Visitor("main"));
        int totalCount = visitorRepository.findAll().stream()
                .filter(v -> "main".equals(v.getPageName()))
                .mapToInt(Visitor::getTotalCount)
                .sum();
        return new VisitorDTO(visitor.getDailyCount(), totalCount);
    }
}
