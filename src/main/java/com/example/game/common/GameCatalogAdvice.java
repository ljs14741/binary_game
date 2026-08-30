package com.example.game.common;

import com.example.game.controller.GameController;
import com.example.game.controller.MainController;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

import java.util.List;

/**
 * {@link GameCatalog} 를 템플릿에서 쓸 수 있게 모델에 얹어준다.
 *
 * <p>이렇게 해두면 게임을 추가할 때 컨트롤러를 고칠 필요가 없다.
 * 화면을 그리는 컨트롤러에만 붙여서 API 응답에는 불필요하게 끼지 않게 한다.
 */
@ControllerAdvice(assignableTypes = {MainController.class, GameController.class})
public class GameCatalogAdvice {

    /** 게임 하단 "다른 게임" 스트립에 몇 개까지 보여줄지. 가로 스크롤이라 그리드 때보다 여유가 있다. */
    private static final int OTHER_GAMES_LIMIT = 8;

    /** 메인 화면 카드 목록. */
    @ModelAttribute("games")
    public List<GameCatalog.Game> games() {
        return GameCatalog.GAMES;
    }

    /** 지금 보고 있는 게임. 게임 페이지가 아니면 null 이다. */
    @ModelAttribute("currentGame")
    public GameCatalog.Game currentGame(HttpServletRequest request) {
        return GameCatalog.byPath(request.getRequestURI());
    }

    /** 현재 게임을 뺀 나머지. 매 요청 섞여서 재방문자에게 다른 게임이 보인다. */
    @ModelAttribute("otherGames")
    public List<GameCatalog.Game> otherGames(HttpServletRequest request) {
        return GameCatalog.others(request.getRequestURI(), OTHER_GAMES_LIMIT);
    }
}
