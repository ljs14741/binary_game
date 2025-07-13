package com.example.game.service;

import com.example.game.dto.GuestbookDTO;
import com.example.game.entity.Guestbook;
import com.example.game.repository.GuestbookRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GuestbookService {

    private final GuestbookRepository guestbookRepository;

    // 등록
    public void create(GuestbookDTO dto) {
        Guestbook guestbook = Guestbook.builder()
                .nickname(dto.getNickname())
                .password(dto.getPassword())
                .content(dto.getContent())
                .build();
        guestbookRepository.save(guestbook);
    }

    // 전체 조회 (password는 응답에 포함 안 됨)
    public List<GuestbookDTO> getAll() {
        return guestbookRepository.findAll(Sort.by(Sort.Direction.DESC, "id")).stream()
                .map(g -> GuestbookDTO.builder()
                        .id(g.getId())
                        .nickname(g.getNickname())
                        .content(g.getContent())
                        .createdAt(g.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    // 삭제
    public boolean delete(Long id, String password) {
        return guestbookRepository.findById(id)
                .filter(g -> g.getPassword().equals(password))
                .map(g -> {
                    guestbookRepository.delete(g);
                    return true;
                })
                .orElse(false);
    }

    public Page<GuestbookDTO> getPaged(int page, int size) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "id"));
        return guestbookRepository.findAll(pageRequest)
                .map(g -> GuestbookDTO.builder()
                        .id(g.getId())
                        .nickname(g.getNickname())
                        .content(g.getContent())
                        .createdAt(g.getCreatedAt())
                        .build());
    }
}