package com.example.game.game.repository;

import com.example.game.game.entity.Game;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GameRepository extends JpaRepository<Game, Long> {
    List<Game> findTop50ByGameNameOrderByScoreDescCreatedDateAsc(String gameName);
}
