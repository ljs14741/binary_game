package com.example.game.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VisitorDTO {
    private String pageName;
    private String date;
    private int dailyCount;
    private long totalCount;
}
