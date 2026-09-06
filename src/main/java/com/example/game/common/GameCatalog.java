package com.example.game.common;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

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
     * @param lastmod  사이트맵의 lastmod. 페이지를 크게 고쳤을 때 갱신한다
     */
    public record Game(
            String path,
            String name,
            String kicker,
            String tagline,
            String lastmod
    ) {
        /**
         * 카드 썸네일. 600x400(3:2) 로 통일돼 있다.
         * 기본은 WebP 이고, PNG_CARDS 에 든 것만 PNG 다.
         */
        public String card() {
            return "/img/cards" + path + (PNG_CARDS.contains(path) ? ".png" : ".webp");
        }
    }

    /*
     * 카드가 PNG 인 게임.
     *
     * 작업 PC 에 WebP 로 굽는 도구가 없다 (ImageMagick·cwebp 둘 다 없고,
     * 윈도우 convert.exe 는 디스크 유틸이라 쓰면 안 된다).
     * 그림은 docs/art/card.js 가 순수 Node 로 굽는다 — 그래서 PNG 다.
     * 나중에 도구가 생기면 WebP 로 다시 구워 여기서 지우면 된다.
     */
    static final Set<String> PNG_CARDS = Set.of("/roulette");

    /** 표시 순서 = 이 목록의 순서. 유입이 많은 게임을 위로 둔다. */
    public static final List<Game> GAMES = List.of(
            new Game("/mugunghwa", "무궁화 꽃이 피었습니다", "Pick",
                    "커피내기·점심내기·벌칙뽑기 · 사다리·룰렛 대체", "2026-08-30"),
            new Game("/ladder", "사다리타기 워터슬라이드", "Ladder",
                    "물이 미끄럼틀을 타고 내려가는 사다리타기 · 커피내기·벌칙뽑기", "2026-08-30"),
            new Game("/press", "압력 프레스", "Press",
                    "누를수록 내려온다 · 벌칙게임·복불복", "2026-08-31"),
            // new Game("/parachute", "낙하산", "Nerve",
            //         "늦게 펼수록 이긴다 · 혼자 기록 도전 · 담력 복불복", "2026-09-01"),
            new Game("/roulette", "물풍선 룰렛", "Roulette",
                    "러시안룰렛 · 돌아가며 펌프질 · 터뜨리면 물벼락", "2026-08-31"),
            new Game("/wasabi", "와사비 룰렛", "Roulette",
                    "초밥 접시 중 와사비를 피하세요 · 커피내기·점심내기", "2026-08-30"),
            new Game("/pinball", "핀볼룰렛 랜덤공뽑기", "Roulette",
                    "핀볼뽑기·랜덤볼뽑기 · 커피내기·점심내기·벌칙뽑기", "2026-08-30"),
            new Game("/horserace", "말달리자 경마내기게임", "Race",
                    "말 하나 골라놓고 끝까지 조마조마 · 경마내기", "2026-08-30"),
            new Game("/dodge", "총알 피하기", "Arcade",
                    "랭킹 도전 · 오래 버틸수록 빨라지는 생존 아케이드", "2026-08-30"),
            new Game("/kimchi", "김치 랜덤 디펜스", "Defense",
                    "뽑기 운으로 막는 랜덤 타워 디펜스", "2026-08-30")
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
