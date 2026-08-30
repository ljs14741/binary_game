/*
 * 사이트 공통 다크/라이트 테마 처리.
 *
 * 예전에는 이 로직이 dodge / kimchi / pinball / wasabi 네 페이지에 각각 복붙돼 있었고,
 * 메인 / horserace / mugunghwa 에는 아예 없어서 공통 헤더의 테마 버튼이 동작하지 않았다.
 * 게다가 wasabi만 기본값이 light라 게임을 오갈 때 화면이 흑백으로 튀었다.
 *
 * <head>의 theme-style 링크 바로 뒤에서 defer 없이 불러온다. (테마 깜빡임 방지)
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'theme';
    var DEFAULT_THEME = 'dark';

    function readTheme() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'light' || saved === 'dark') {
                return saved;
            }
        } catch (e) {
            // 사파리 프라이빗 모드 등에서 localStorage 접근이 막히는 경우
        }
        return DEFAULT_THEME;
    }

    function markTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        // wasabi.css가 body[data-theme="dark"] 선택자를 쓰기 때문에 body에도 표시한다.
        if (document.body) {
            document.body.setAttribute('data-theme', theme);
        }
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0b0d10');
        }
    }

    function applyTheme(theme) {
        var link = document.getElementById('theme-style');
        if (link) {
            link.setAttribute('href', '/css/main-' + theme + '.css');
        }
        markTheme(theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {
            // 저장 실패해도 이번 페이지에서는 정상 동작한다.
        }
    }

    // 즉시 적용한다. 이 시점에는 body가 아직 없을 수 있다.
    applyTheme(readTheme());

    document.addEventListener('DOMContentLoaded', function () {
        markTheme(readTheme());
    });

    // 테마 버튼(#themeToggle)의 클릭은 binaryworld.kr 공통 헤더(header.js)가 독점한다.
    // 캡처 단계에서 stopImmediatePropagation()을 걸기 때문에 여기서 클릭을 잡을 수 없다.
    // 대신 header.js가 테마를 바꾼 뒤 쏘는 이벤트를 받아 data-theme을 맞춘다.
    // (header.js는 CSS 링크와 localStorage만 바꾸고 data-theme은 건드리지 않는다)
    document.addEventListener('bw:theme-change', function (event) {
        var theme = event && event.detail ? event.detail.theme : null;
        markTheme(theme === 'light' ? 'light' : 'dark');
    });
})();
