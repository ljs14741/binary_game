package com.example.game.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.LocaleResolver;

import java.util.Locale;

/**
 * 요청의 언어를 정한다. {@link LocalePrefixFilter} 가 붙인 표시가 있으면 그 언어, 없으면 한국어.
 *
 * <p>브라우저의 Accept-Language 는 보지 않는다. 주소가 언어를 정한다 — 같은 주소는 누구에게나 같은 언어다.
 * Thymeleaf 의 {@code #{...}} 와 {@code #locale} 이 이 결과를 따른다.
 */
public class PathLocaleResolver implements LocaleResolver {

    public static final Locale DEFAULT = Locale.KOREAN;

    @Override
    public Locale resolveLocale(HttpServletRequest request) {
        Object lang = request.getAttribute(LocalePrefixFilter.ATTR_LANG);
        return lang == null ? DEFAULT : Locale.forLanguageTag(lang.toString());
    }

    @Override
    public void setLocale(HttpServletRequest request, HttpServletResponse response, Locale locale) {
        throw new UnsupportedOperationException("언어는 주소(/en/...)로 정한다. 요청 중에 바꾸지 않는다.");
    }
}
