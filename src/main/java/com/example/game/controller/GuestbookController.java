package com.example.game.controller;

import com.example.game.dto.GuestbookDTO;
import com.example.game.service.GuestbookService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/guestbook")
public class GuestbookController {

    private final GuestbookService guestbookService;

    // 글 등록
    @PostMapping
    public ResponseEntity<Void> create(@RequestBody GuestbookDTO dto) {
        guestbookService.create(dto);
        return ResponseEntity.ok().build();
    }

    // 전체 목록 조회
    @GetMapping
    public ResponseEntity<List<GuestbookDTO>> getAll() {
        return ResponseEntity.ok(guestbookService.getAll());
    }

    // 글 삭제
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, @RequestParam String password) {
        boolean deleted = guestbookService.delete(id, password);
        if (deleted) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.status(403).body("비밀번호가 틀렸습니다.");
        }
    }

    @GetMapping("/paged")
    public ResponseEntity<Page<GuestbookDTO>> getPaged(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size
    ) {
        return ResponseEntity.ok(guestbookService.getPaged(page, size));
    }
}