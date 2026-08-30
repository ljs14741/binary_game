package com.example.game.controller;

import com.example.game.common.GameCatalog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

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
        xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        // 메인은 목록 맨 앞에 두고, 그 다음이 게임, 마지막이 안내 페이지다.
        append(xml, STATIC_PAGES.get(0));

        for (GameCatalog.Game game : GameCatalog.GAMES) {
            append(xml, new Page(game.path(), "0.95", "weekly", game.lastmod()));
        }

        for (Page page : STATIC_PAGES.subList(1, STATIC_PAGES.size())) {
            append(xml, page);
        }

        xml.append("</urlset>\n");
        return xml.toString();
    }

    private void append(StringBuilder xml, Page page) {
        xml.append("  <url>\n")
                .append("    <loc>").append(BASE_URL).append(page.path()).append("</loc>\n")
                .append("    <lastmod>").append(page.lastmod()).append("</lastmod>\n")
                .append("    <changefreq>").append(page.changefreq()).append("</changefreq>\n")
                .append("    <priority>").append(page.priority()).append("</priority>\n")
                .append("  </url>\n");
    }
}
