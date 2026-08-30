package com.example.game.common;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 게임 목록의 단일 진실 공급원.
 *
 * 예전에는 같은 목록이 세 군데에 흩어져 있었다.
 * 메인 화면 카드(main.html), 게임 하단 "다른 게임" 섹션(fragments/other-games.html),
 * 그리고 sitemap.xml. 게임을 하나 추가하려면 세 곳을 다 고쳐야 했고,
 * 실제로 어긋나 있었다.
 *
 * <p>새 게임을 추가할 때는 아래 {@link #GAMES} 에 한 줄을 넣는다.
 * 그러면 메인 카드, 다른 게임 섹션, 사이트맵에 동시에 반영된다.
 * (게임 페이지 템플릿과 컨트롤러 라우트는 별도로 만들어야 한다)
 */
public final class GameCatalog {

    private GameCatalog() {
    }

    /**
     * @param path     라우트 (예: {@code /wasabi})
     * @param name     화면에 보이는 게임 이름
     * @param kicker   카드 상단의 짧은 영문 라벨
     * @param tagline  카드 아래 한 줄 설명
     * @param featured 메인 화면에서 크게 보여줄지 여부. 한 개만 true 로 둔다
     * @param lastmod  사이트맵의 lastmod. 페이지를 크게 고쳤을 때 갱신한다
     */
    public record Game(
            String path,
            String name,
            String kicker,
            String tagline,
            boolean featured,
            String lastmod
    ) {
        /** 카드 썸네일. 600x400(3:2) WebP 로 통일돼 있다. */
        public String card() {
            return "/img/cards" + path + ".webp";
        }
    }

    /** 표시 순서 = 이 목록의 순서. 유입이 많은 게임을 위로 둔다. */
    public static final List<Game> GAMES = List.of(
            new Game("/mugunghwa", "무궁화 꽃이 피었습니다", "Pick",
                    "커피내기·점심내기·벌칙뽑기 · 사다리·룰렛 대체", true, "2026-08-30"),
            new Game("/wasabi", "와사비 룰렛", "Roulette",
                    "초밥 접시 중 와사비를 피하세요 · 커피내기·점심내기", false, "2026-08-30"),
            new Game("/pinball", "핀볼룰렛 랜덤공뽑기", "Roulette",
                    "핀볼뽑기·랜덤볼뽑기 · 커피내기·점심내기·벌칙뽑기", false, "2026-08-30"),
            new Game("/horserace", "말달리자 경마내기게임", "Race",
                    "말 하나 골라놓고 끝까지 조마조마 · 경마내기", false, "2026-08-30"),
            new Game("/dodge", "총알 피하기", "Arcade",
                    "랭킹 도전 · 오래 버틸수록 빨라지는 생존 아케이드", false, "2026-08-30"),
            new Game("/kimchi", "김치 랜덤 디펜스", "Defense",
                    "뽑기 운으로 막는 랜덤 타워 디펜스", false, "2026-08-30")
    );

    /** 경로로 하나 찾는다. 없으면 null. */
    public static Game byPath(String path) {
        if (path == null) {
            return null;
        }
        for (Game g : GAMES) {
            if (g.path().equals(path)) {
                return g;
            }
        }
        return null;
    }

    /**
     * 게임 페이지 하단 "다른 게임" 섹션에 뿌릴 목록.
     *
     * <p>현재 게임은 빼고, {@code limit} 개까지만 돌려준다.
     * 게임이 20개가 되면 19장을 전부 내리는 셈이라 개수 제한이 필요하다.
     * 매번 순서를 섞어서 재방문자에게 다른 게임이 눈에 띄도록 한다.
     */
    public static List<Game> others(String currentPath, int limit) {
        List<Game> rest = new ArrayList<>(GAMES.size());
        for (Game g : GAMES) {
            if (!g.path().equals(currentPath)) {
                rest.add(g);
            }
        }
        Collections.shuffle(rest);
        return rest.size() > limit ? rest.subList(0, limit) : rest;
    }
}
