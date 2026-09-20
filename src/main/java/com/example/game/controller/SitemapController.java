package com.example.game.controller;

import com.example.game.common.GameCatalog;
import com.example.game.common.LocalePrefixFilter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * sitemap.xml을 코드에서 생성한다.
 *
 * 예전에는 static/sitemap.xml을 손으로 관리했는데, 게임을 추가할 때마다 빠뜨리기 쉬웠다.
 * 실제로 /about, /privacy-policy, /contact 세 개가 누락된 채로 방치돼 있었다.
 *
 * 게임 URL은 {@link GameCatalog} 에서 그대로 가져온다.
 * 게임을 추가하면 여기는 손댈 필요가 없다.
 * 안내 페이지만 아래 STATIC_PAGES 에서 관리한다.
 *
 * <p>번역이 있는 게임({@code langs})은 언어별 URL 을 각각 내고, 서로를 hreflang 으로 가리킨다.
 * 구글은 사이트맵의 xhtml:link 를 페이지 안 hreflang 과 같은 신호로 본다.
 */
@RestController
public class SitemapController {

    private static final String BASE_URL = "https://game.binaryworld.kr";

    private record Page(String path, String priority, String changefreq, String lastmod) {
    }

    private static final List<Page> STATIC_PAGES = List.of(
            new Page("/", "1.00", "weekly", "2026-08-30"),
            new Page("/about", "0.30", "monthly", "2026-07-22"),
            new Page("/privacy-policy", "0.30", "monthly", "2026-07-22"),
            new Page("/contact", "0.30", "monthly", "2026-07-22")
    );

    @GetMapping(value = "/sitemap.xml", produces = "application/xml;charset=UTF-8")
    public String sitemap() {
        StringBuilder xml = new StringBuilder(1024);
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"")
                .append(" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n");

        // 메인은 목록 맨 앞에 두고, 그 다음이 게임, 마지막이 안내 페이지다.
        append(xml, STATIC_PAGES.get(0));

        for (GameCatalog.Game game : GameCatalog.GAMES) {
            List<String> langs = new ArrayList<>();
            langs.add("ko");
            for (String l : LocalePrefixFilter.SUPPORTED) {
                if (game.hasLang(l)) {
                    langs.add(l);
                }
            }
            for (String l : langs) {
                String path = l.equals("ko") ? game.path() : "/" + l + game.path();
                append(xml, new Page(path, "0.95", "weekly", game.lastmod()), game, langs);
            }
        }

        for (Page page : STATIC_PAGES.subList(1, STATIC_PAGES.size())) {
            append(xml, page);
        }

        xml.append("</urlset>\n");
        return xml.toString();
    }

    private void append(StringBuilder xml, Page page) {
        append(xml, page, null, List.of());
    }

    /** {@code langs} 가 둘 이상이면 언어별 대체 주소를 xhtml:link 로 같이 적는다. */
    private void append(StringBuilder xml, Page page, GameCatalog.Game game, List<String> langs) {
        xml.append("  <url>\n")
                .append("    <loc>").append(BASE_URL).append(page.path()).append("</loc>\n")
                .append("    <lastmod>").append(page.lastmod()).append("</lastmod>\n")
                .append("    <changefreq>").append(page.changefreq()).append("</changefreq>\n")
                .append("    <priority>").append(page.priority()).append("</priority>\n");
        if (game != null && langs.size() > 1) {
            for (String l : langs) {
                String href = BASE_URL + (l.equals("ko") ? game.path() : "/" + l + game.path());
                xml.append("    <xhtml:link rel=\"alternate\" hreflang=\"").append(l)
                        .append("\" href=\"").append(href).append("\"/>\n");
            }
            xml.append("    <xhtml:link rel=\"alternate\" hreflang=\"x-default\" href=\"")
                    .append(BASE_URL).append(game.path()).append("\"/>\n");
        }
        xml.append("  </url>\n");
    }
}
