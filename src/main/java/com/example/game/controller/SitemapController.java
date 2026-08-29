package com.example.game.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * sitemap.xml을 코드에서 생성한다.
 *
 * 예전에는 static/sitemap.xml을 손으로 관리했는데, 게임을 추가할 때마다 빠뜨리기 쉬웠다.
 * 실제로 /about, /privacy-policy, /contact 세 개가 누락된 채로 방치돼 있었다.
 *
 * 새 페이지(게임)를 만들면 아래 PAGES 목록에 한 줄만 추가한다.
 * 페이지 내용을 크게 고쳤을 때는 그 줄의 lastmod 날짜도 함께 갱신한다.
 */
@RestController
public class SitemapController {

    private static final String BASE_URL = "https://game.binaryworld.kr";

    private record Page(String path, String priority, String changefreq, String lastmod) {
    }

    private static final List<Page> PAGES = List.of(
            new Page("/", "1.00", "weekly", "2026-08-29"),

            // 게임
            new Page("/wasabi", "0.95", "weekly", "2026-08-29"),
            new Page("/mugunghwa", "0.95", "weekly", "2026-08-29"),
            new Page("/horserace", "0.95", "weekly", "2026-08-29"),
            new Page("/pinball", "0.95", "weekly", "2026-08-29"),
            new Page("/dodge", "0.95", "weekly", "2026-08-29"),
            new Page("/kimchi", "0.90", "weekly", "2026-08-29"),

            // 안내 페이지
            new Page("/about", "0.30", "monthly", "2026-07-22"),
            new Page("/privacy-policy", "0.30", "monthly", "2026-07-22"),
            new Page("/contact", "0.30", "monthly", "2026-07-22")
    );

    @GetMapping(value = "/sitemap.xml", produces = "application/xml;charset=UTF-8")
    public String sitemap() {
        StringBuilder xml = new StringBuilder(1024);
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        for (Page page : PAGES) {
            xml.append("  <url>\n")
                    .append("    <loc>").append(BASE_URL).append(page.path()).append("</loc>\n")
                    .append("    <lastmod>").append(page.lastmod()).append("</lastmod>\n")
                    .append("    <changefreq>").append(page.changefreq()).append("</changefreq>\n")
                    .append("    <priority>").append(page.priority()).append("</priority>\n")
                    .append("  </url>\n");
        }

        xml.append("</urlset>\n");
        return xml.toString();
    }
}
