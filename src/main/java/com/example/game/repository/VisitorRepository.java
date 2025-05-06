package com.example.game.repository;

import com.example.game.entity.Visitor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface VisitorRepository extends JpaRepository<Visitor, Long> {
    Optional<Visitor> findByPageNameAndDate(String pageName, LocalDate date);
}
