package com.example.game.repository;

import com.example.game.entity.Guestbook;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestbookRepository extends JpaRepository<Guestbook, Long> {
}
