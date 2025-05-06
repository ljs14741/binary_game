package com.example.game.game.service;

import com.example.game.game.entity.Game;
import com.example.game.game.repository.GameRepository;
import com.example.game.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StressGameService {
    private final GameRepository gameRepository;

    private final UserRepository userRepository;

    public List<Game> getTopScoresByGameName(String gameName) {
        return gameRepository.findTop50ByGameNameOrderByScoreDescCreatedDateAsc(gameName);
    }

    public List<Game> getTopScoresForAvoidingStressGame() {
        return getTopScoresByGameName("총알 피하기");
    }
}
