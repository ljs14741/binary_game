package com.example.game.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@Builder
@ToString
@AllArgsConstructor
@NoArgsConstructor
@Entity(name = "daily_visitors") // 매핑될 테이블명
public class DailyVisitor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id") // 컬럼명과 동일하게 명시
    private Long id;

    @Column(name = "page_name", nullable = false)
    private String pageName;

    @Column(name = "date", nullable = false)
    private LocalDate date;

    @Column(name = "visit_count", nullable = false)
    private int visitCount;
}