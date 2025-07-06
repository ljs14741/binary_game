package com.example.game.repository;

import com.example.game.entity.TotalVisitor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TotalVisitorRepository extends JpaRepository<TotalVisitor, Long> {
    Optional<TotalVisitor> findByPageName(String pageName);
}