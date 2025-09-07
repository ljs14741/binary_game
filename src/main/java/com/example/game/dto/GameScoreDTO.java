package com.example.game.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GameScoreDTO {
    private Long id;
    private String nickname;
    private Integer score;
}
