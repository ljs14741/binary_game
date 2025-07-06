package com.example.game.entity;

import jakarta.persistence.*;
import lombok.*;

@Getter
@Setter
@Builder
@ToString
@AllArgsConstructor
@NoArgsConstructor
@Entity(name = "total_visitors")
public class TotalVisitor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "page_name", nullable = false, unique = true)
    private String pageName;

    @Column(name = "total_count", nullable = false)
    private Long totalCount;
}