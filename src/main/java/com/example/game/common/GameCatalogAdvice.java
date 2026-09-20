package com.example.game.common;

import com.example.game.controller.GameController;
import com.example.game.controller.MainController;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

import java.util.ArrayList;
import java.util.List;

/**
 * {@link GameCatalog} 를 템플릿에서 쓸 수 있게 모델에 얹어준다.
 *
 * <p>이렇게 해두면 게임을 추가할 때 컨트롤러를 고칠 필요가 없다.
 * 화면을 그리는 컨트롤러에만 붙여서 API 응답에는 불필요하게 끼지 않게 한다.
 */
@ControllerAdvice(assignableTypes = {MainController.class, GameController.class})
public class GameCatalogAdvice {

    /** 게임 하단 "다른 게임" 스트립에 몇 개까지 보여줄지. 가로 스크롤이라 그리드 때보다 여유가 있다.
     *  게임이 11개라 8개로 자르면 매번 2개가 랜덤으로 빠져 "원판돌리기가 안 나온다"는 말이 나왔다. 지금은 전부 보여준다. */
    private static final int OTHER_GAMES_LIMIT = 16;

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

    /** 언어별 주소. 템플릿의 canonical·hreflang·언어 전환 링크가 쓴다. */
    public record LangLink(String lang, String url) {
    }

    private static final String BASE_URL = "https://game.binaryworld.kr";

    /** 지금 요청의 언어 코드 ("ko" 기본). 주소 접두가 정한다 — {@link LocalePrefixFilter}. */
    @ModelAttribute("lang")
    public String lang(HttpServletRequest request) {
        Object l = request.getAttribute(LocalePrefixFilter.ATTR_LANG);
        return l == null ? "ko" : l.toString();
    }

    /**
     * 현재 게임의 언어별 주소 목록. 한국어가 먼저, 그다음 번역된 언어.
     * 게임 페이지가 아니거나 번역이 없으면 한국어 하나만 든다 (canonical 용).
     */
    @ModelAttribute("langLinks")
    public List<LangLink> langLinks(HttpServletRequest request) {
        String path = request.getRequestURI();
        List<LangLink> links = new ArrayList<>();
        links.add(new LangLink("ko", BASE_URL + path));
        GameCatalog.Game game = GameCatalog.byPath(path);
        if (game != null) {
            for (String l : LocalePrefixFilter.SUPPORTED) {
                if (game.hasLang(l)) {
                    links.add(new LangLink(l, BASE_URL + "/" + l + path));
                }
            }
        }
        return links;
    }

    /** 지금 보고 있는 언어의 주소. canonical 과 og:url 에 쓴다. */
    @ModelAttribute("canonicalUrl")
    public String canonicalUrl(HttpServletRequest request) {
        String l = lang(request);
        for (LangLink link : langLinks(request)) {
            if (link.lang().equals(l)) {
                return link.url();
            }
        }
        return BASE_URL + request.getRequestURI();
    }

    /** 현재 게임을 뺀 나머지. 매 요청 섞여서 재방문자에게 다른 게임이 보인다. */
    @ModelAttribute("otherGames")
    public List<GameCatalog.Game> otherGames(HttpServletRequest request) {
        return GameCatalog.others(request.getRequestURI(), OTHER_GAMES_LIMIT);
    }
}
