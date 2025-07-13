package com.example.game.dto;


import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GuestbookDTO {
    private Long id;
    private String nickname;
    private String password;   // POST에서만 사용
    private String content;
    private LocalDateTime createdAt;
}