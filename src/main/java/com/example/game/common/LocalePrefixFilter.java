package com.example.game.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * 언어 접두 URL 을 처리한다. {@code /en/wasabi} → 요청에 언어를 표시하고 {@code /wasabi} 로 내부 전달.
 *
 * <p>왜 접두 URL 인가 — 구글이 언어별로 따로 색인하려면 주소가 달라야 한다.
 * {@code ?lang=en} 이나 JS 로 글자만 바꿔치기(경마 방식)는 구글이 한국어 문서로 본다.
 * 브라우저 언어를 보고 자동으로 튕기는 것도 안 한다. 구글봇이 한국어 페이지를 크롤링하러 와서
 * 영어로 튕기면 한국어 색인이 망가진다.
 *
 * <p>번역이 있는 게임만 연다 ({@link GameCatalog.Game#langs()}). 번역 없는 게임을 {@code /en/} 으로 열면
 * 영어 주소에 한국어 내용이 나와 중복 콘텐츠가 된다. 그건 404.
 *
 * <p>언어를 하나 더 지원하려면 {@link #SUPPORTED} 에 넣고 {@code messages_xx.properties} 를 만든다.
 * 컨트롤러는 손댈 게 없다 — 전달된 요청은 원래 라우트로 그대로 간다.
 */
@Component
public class LocalePrefixFilter extends OncePerRequestFilter {

    /** 지원 언어 (한국어는 접두 없이 기본). 순서 = hreflang·언어 전환 링크에 나오는 순서. */
    public static final List<String> SUPPORTED = List.of("en", "ja");

    /** 요청 속성 키. {@link PathLocaleResolver} 가 읽는다. */
    public static final String ATTR_LANG = "bw.lang";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();
        int slash = uri.indexOf('/', 1);
        String first = slash > 0 ? uri.substring(1, slash) : uri.substring(1);

        if (!SUPPORTED.contains(first)) {
            chain.doFilter(request, response);
            return;
        }

        String rest = slash > 0 ? uri.substring(slash) : "/";
        GameCatalog.Game game = GameCatalog.byPath(rest);
        if (game == null || !game.hasLang(first)) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }

        request.setAttribute(ATTR_LANG, first);
        request.getRequestDispatcher(rest).forward(request, response);
    }
}
