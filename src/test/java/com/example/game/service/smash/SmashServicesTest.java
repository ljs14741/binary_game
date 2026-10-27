package com.example.game.service.smash;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.InputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class SmashServicesTest {

    private final ObjectMapper om = new ObjectMapper();

    private JsonNode fixture() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/smash/overpass-pangyo.json")) {
            return om.readTree(in);
        }
    }

    @Test
    void convertsRealOverpassResponse() throws Exception {
        OsmConverter.AreaData a = OsmConverter.convert(fixture().path("elements"), 37.3595, 127.1052, 260);
        assertFalse(a.buildings().isEmpty(), "buildings");
        assertFalse(a.roads().isEmpty(), "roads");
        for (OsmConverter.Building b : a.buildings()) {
            assertTrue(b.h() > 2 && b.h() < 700, "height " + b.h());
            assertTrue(b.poly().length >= 6 && b.poly().length % 2 == 0, "poly");
            // 닫는 점은 빠지고, 감기는 방향은 신발끈 면적 음수로 통일
            assertTrue(OsmConverter.signedArea(b.poly()) < 0, "winding " + b.id());
            assertTrue(b.id().startsWith("w") || b.id().startsWith("r"));
            for (double v : b.poly()) assertTrue(Math.abs(v) < 600, "local meters");
        }
        for (OsmConverter.Road r : a.roads()) {
            assertTrue(r.w() > 0);
            assertTrue(List.of("major", "mid", "minor", "foot").contains(r.t()));
        }
    }

    @Test
    void duplicateElementsAreDroppedAndCcwIsEnforced() throws Exception {
        String json = """
                [{"type":"way","id":1,"tags":{"building":"yes","building:levels":"10"},
                  "geometry":[{"lat":37.0,"lon":127.0},{"lat":37.0,"lon":127.0003},{"lat":37.0003,"lon":127.0003},{"lat":37.0003,"lon":127.0},{"lat":37.0,"lon":127.0}]},
                 {"type":"way","id":1,"tags":{"building":"yes"},
                  "geometry":[{"lat":37.0,"lon":127.0},{"lat":37.0,"lon":127.0003},{"lat":37.0003,"lon":127.0003},{"lat":37.0,"lon":127.0}]},
                 {"type":"way","id":2,"tags":{"building":"roof"},
                  "geometry":[{"lat":37.0,"lon":127.0},{"lat":37.0,"lon":127.0003},{"lat":37.0003,"lon":127.0003},{"lat":37.0,"lon":127.0}]}]
                """;
        OsmConverter.AreaData a = OsmConverter.convert(om.readTree(json), 37.00015, 127.00015, 260);
        assertEquals(1, a.buildings().size());
        OsmConverter.Building b = a.buildings().get(0);
        assertEquals(8, b.poly().length);
        assertEquals(10 * 3.3 + 1.5, b.h(), 0.11);
        assertEquals(10, b.lv());
        assertTrue(OsmConverter.signedArea(b.poly()) < 0);
    }

    @Test
    void convertsVWorldBuildingsWithNamesHeightsAndKinds() throws Exception {
        // 건물통합정보 2개 + 도로명주소 건물 이름 1개 (이름은 두 번째 건물 안에 든 점)
        String info = """
                [{"type":"Feature","id":"LT_C_BLDGINFO.11","geometry":{"type":"MultiPolygon","coordinates":[[[[127.0,37.0],[127.0004,37.0],[127.0004,37.0003],[127.0,37.0003],[127.0,37.0]]]]},
                  "properties":{"bld_nm":"","dong_nm":"","usability":"14000","grnd_flr":"8","ugrnd_flr":"2","height":"36.1"}},
                 {"type":"Feature","id":"LT_C_BLDGINFO.12","geometry":{"type":"MultiPolygon","coordinates":[[[[127.001,37.0],[127.0014,37.0],[127.0014,37.0003],[127.001,37.0003],[127.001,37.0]]]]},
                  "properties":{"bld_nm":"","dong_nm":"","usability":"02001","grnd_flr":"20","height":"0"}},
                 {"type":"Feature","id":"LT_C_BLDGINFO.13","geometry":{"type":"MultiPolygon","coordinates":[[[[127.002,37.0],[127.0024,37.0],[127.0024,37.0003],[127.002,37.0003],[127.002,37.0]]]]},
                  "properties":{"usability":"04000","grnd_flr":"0","ugrnd_flr":"1","height":"0"}}]
                """;
        String names = """
                [{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[127.0011,37.0001],[127.0013,37.0001],[127.0013,37.0002],[127.0011,37.0001]]]]},
                  "properties":{"buld_nm":"인덕원 메트로빌","buld_nm_dc":""}}]
                """;
        List<JsonNode> infoList = new java.util.ArrayList<>(), nameList = new java.util.ArrayList<>();
        om.readTree(info).forEach(infoList::add);
        om.readTree(names).forEach(nameList::add);
        List<OsmConverter.Building> out = SmashVWorldService.convert(infoList, nameList, 37.00015, 127.0012, 260);
        assertEquals(2, out.size(), "지하만 있는 건물은 뺀다");
        OsmConverter.Building office = out.get(0), apt = out.get(1);
        assertEquals("v11", office.id());
        assertEquals("office", office.kind());
        assertEquals(36.1, office.h(), 1e-9);
        assertEquals(null, office.name());
        assertEquals("apartments", apt.kind());
        assertEquals(20 * 3.3 + 1.5, apt.h(), 0.11, "높이가 없으면 층수로");
        assertEquals("인덕원 메트로빌", apt.name());
        for (OsmConverter.Building b : out) assertTrue(OsmConverter.signedArea(b.poly()) < 0);
    }

    @Test
    void vworldNameAndKindRules() {
        assertEquals("신한데뷰오피스텔", SmashVWorldService.joinName("신한데뷰오피스텔", "신한데뷰오피스텔"));
        assertEquals("멤피스타워", SmashVWorldService.joinName("멤피스타워", "주건축물제1동"));
        assertEquals("래미안 101동", SmashVWorldService.joinName("래미안", "101동"));
        assertEquals("101동", SmashVWorldService.joinName("", "101동"));
        assertEquals("house", SmashVWorldService.kind("01001"));
        assertEquals("commercial", SmashVWorldService.kind("03000"));
        assertEquals("office", SmashVWorldService.kind("14201"));
        assertEquals("yes", SmashVWorldService.kind(""));
        assertTrue(SmashVWorldService.inKorea(37.4, 126.97));
        assertFalse(SmashVWorldService.inKorea(35.68, 139.76));
    }

    @Test
    void parsesKakaoAddressAndMergesWithPlaces() throws Exception {
        String json = """
                {"documents":[{"address_name":"경기 안양시 동안구 관양동 1488","x":"126.9766","y":"37.4015",
                  "address":{"address_name":"경기 안양시 동안구 관양동 1488"},
                  "road_address":{"address_name":"경기 안양시 동안구 관악대로 288","building_name":"인덕원 메트로빌"}},
                 {"address_name":"경기 안양시 동안구 관양동 1500","x":"126.98","y":"37.40","address":{"address_name":"경기 안양시 동안구 관양동 1500"},"road_address":null}]}
                """;
        List<SmashPlaceService.Place> a = SmashPlaceService.parseKakaoAddress(om.readTree(json));
        assertEquals("인덕원 메트로빌", a.get(0).name());
        assertEquals("경기 안양시 동안구 관악대로 288", a.get(0).address());
        assertEquals("주소", a.get(0).category());
        assertEquals("경기 안양시 동안구 관양동 1500", a.get(1).name(), "도로명이 없으면 지번");
        // 30m 안에 겹치면 뒤 목록에서 뺀다
        var place = new SmashPlaceService.Place("인덕원 메트로빌 상가", "", "빌딩", 37.40151, 126.97661);
        assertEquals(2, SmashPlaceService.merge(List.of(place), a).size());
        assertTrue(SmashPlaceService.looksLikeAddress("관악대로 288"));
        assertTrue(SmashPlaceService.looksLikeAddress("관양동 1488-3"));
        assertTrue(SmashPlaceService.looksLikeAddress("흥안대로427번길 38"));
        assertFalse(SmashPlaceService.looksLikeAddress("삼성전자 서초사옥"));
    }

    @Test
    void rankNameRulesAndDamageCaps() {
        assertEquals("삼성전자", SmashRankService.nameKey("(주)삼성 전자"));
        assertEquals("삼성전자", SmashRankService.nameKey("㈜삼성전자"));
        assertEquals("네이버", SmashRankService.nameKey("네이버 주식회사"));
        assertEquals("lg트윈타워", SmashRankService.nameKey("LG 트윈타워"));
        assertTrue(SmashRankService.allowedName("가족같은 회사", SmashRankService.nameKey("가족같은 회사")));
        assertFalse(SmashRankService.allowedName("ㅅㅂ회사", SmashRankService.nameKey("ㅅㅂ회사")), "금칙어");
        assertFalse(SmashRankService.allowedName("a", "a"), "너무 짧음");
        assertFalse(SmashRankService.allowedName("12345", "12345"), "숫자만");
        assertEquals("abc", SmashRankService.clean("  a<b>c  ").replace(" ", ""));
        assertEquals(60_000, SmashRankService.plausible(9_999_999, 1000), "한 판 상한");
        assertEquals(3_000 * 20, SmashRankService.plausible(1_000_000, 20), "초당 상한");
        assertEquals(0, SmashRankService.plausible(-5, 30));
        assertEquals(SmashRankService.hash("1.2.3.4"), SmashRankService.hash("1.2.3.4"));
        assertFalse(SmashRankService.hash("1.2.3.4").contains("1.2.3.4"));
    }

    @Test
    void bossLabelKeepsOnlySurnameAndTitle() {
        // 이름 + 직함, 이름 안 띄어쓰기는 붙임, 이름 6글자 제한
        assertEquals("김철수 부장님", SmashBossService.label("김철수", "부장님"));
        assertEquals("김철수 부장님", SmashBossService.label(" 김 철수 ", "  부장님 "));
        assertEquals("가나다라마바 과장", SmashBossService.label("가나다라마바사", "과장"), "이름 6글자 제한");
        assertEquals("부장님", SmashBossService.label("", "부장님"));
        assertEquals("사장님", SmashBossService.label(null, "사장님"));
        assertEquals("김 대표이사사장님입", SmashBossService.label("김", "대표이사사장님입니다"), "직함 8글자 제한");
        assertEquals("김철수 과장", SmashBossService.label("김<철수>", "과<장>"), "꺾쇠 제거");
        // "님" 있든 없든, 띄어쓰기 있든 없든 같은 상사로 묶음
        assertEquals("김부장", SmashBossService.labelKey("김 부장님"));
        assertEquals("김부장", SmashBossService.labelKey("김 부장"));
        assertEquals("kim팀장", SmashBossService.labelKey("Kim 팀장님"));
    }

    @Test
    void bossLabelRulesAndHitCaps() {
        assertTrue(SmashBossService.allowedLabel(SmashBossService.labelKey("김 부장님")));
        assertTrue(SmashBossService.allowedLabel(SmashBossService.labelKey("부장님")), "직함만 바꿔도 올라감");
        assertTrue(SmashBossService.allowedLabel(SmashBossService.labelKey("김 사장님")), "성 붙은 사장님은 올라감");
        assertFalse(SmashBossService.allowedLabel(SmashBossService.labelKey("사장님")), "기본 상사는 뺌");
        assertFalse(SmashBossService.allowedLabel(SmashBossService.labelKey("사장")), "기본 상사는 뺌");
        assertFalse(SmashBossService.allowedLabel(SmashBossService.labelKey("ㅅㅂ 부장")), "회사 금칙어");
        assertFalse(SmashBossService.allowedLabel(SmashBossService.labelKey("ㅅ1ㅂ 부장")), "숫자 끼운 욕");
        assertFalse(SmashBossService.allowedLabel(SmashBossService.labelKey("또라이 부장")), "상사 전용 금칙어");
        assertFalse(SmashBossService.allowedLabel(SmashBossService.labelKey("김 미친놈")), "상사 전용 금칙어");
        assertFalse(SmashBossService.allowedLabel("김"), "너무 짧음");
        assertFalse(SmashBossService.allowedLabel("12345"), "숫자만");
        assertEquals(600, SmashBossService.plausible(99_999, 10_000), "한 판 상한");
        assertEquals(4 * 20, SmashBossService.plausible(1_000, 20), "초당 상한");
        assertEquals(37, SmashBossService.plausible(37, 60));
        assertEquals(0, SmashBossService.plausible(-3, 60));
    }

    @Test
    void bossLookIsFilteredAndRoundTrips() {
        java.util.Map<String, String> in = new java.util.LinkedHashMap<>();
        in.put("outfit", "golf"); in.put("hat", "crown"); in.put("evil", "x"); in.put("suit", "<b>"); in.put("gender", "f");
        String json = SmashBossService.lookJson(in);
        assertEquals("{\"gender\":\"f\",\"outfit\":\"golf\",\"hat\":\"crown\"}", json, "모르는 칸·이상한 값은 버림");
        assertEquals(java.util.Map.of("gender", "f", "outfit", "golf", "hat", "crown"), SmashBossService.parseLook(json));
        assertNull(SmashBossService.lookJson(java.util.Map.of("evil", "x")));
        assertNull(SmashBossService.parseLook(null));
    }

    @Test
    void bossSubmitSkipsDefaultShortAndBadAndClampsHits() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SmashBossService s = new SmashBossService(jdbc);
        assertFalse(s.submit("", "사장님", 30, 60, "1.1.1.1"), "기본 상사");
        assertFalse(s.submit("김", "부장님", 30, 10, "1.1.1.1"), "15초 안 됨");
        assertFalse(s.submit("김", "부장님", 0, 60, "1.1.1.1"), "안 날림");
        assertFalse(s.submit("씨", "발부장", 30, 60, "1.1.1.1"), "금칙어");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        assertTrue(s.submit("김철수", "부장님", 9_999, 30, "1.1.1.1"));
        // 횟수는 30초 × 4 로 잘림. 처음 본 사람이라 player +1
        verify(jdbc).update(anyString(), eq("김철수부장"), eq("김철수 부장님"), eq(120), eq((Object) null), eq(1));
        assertTrue(s.submit("김철수", "부장", 5, 30, "1.1.1.1"));
        verify(jdbc).update(anyString(), eq("김철수부장"), eq("김철수 부장"), eq(5), eq((Object) null), eq(0));
    }

    @Test
    void parsesKakaoSubwayExit() throws Exception {
        String json = """
                {"documents":[{"place_name":"인덕원역 4호선 2번출구","category_name":"교통,수송 > 지하철,전철 > 지하철출구","x":"126.97747","y":"37.40115"},
                              {"place_name":"인덕원역 4호선 12번출구","category_name":"교통,수송 > 지하철,전철 > 지하철출구","x":"1","y":"1"}]}
                """;
        SmashPlaceService.Exit e = SmashPlaceService.parseExit(om.readTree(json), "인덕원", 2);
        assertEquals(2, e.no());
        assertEquals(37.40115, e.lat(), 1e-9);
        assertEquals(null, SmashPlaceService.parseExit(om.readTree(json), "인덕원", 1), "12번출구는 1번이 아니다");
    }

    @Test
    void decodesOpenFreeMapTileIntoArea() throws Exception {
        byte[] pbf;
        try (InputStream in = getClass().getResourceAsStream("/smash/ofm-pangyo-14-13976-6356.pbf")) {
            pbf = in.readAllBytes();
        }
        var layers = MvtTile.decode(pbf);
        assertTrue(layers.containsKey("building"), "building layer");
        assertTrue(layers.containsKey("transportation"), "transportation layer");
        OsmConverter.AreaData a = MvtAreaConverter.convert(
                List.of(new MvtAreaConverter.TileData(14, 13976, 6356, layers)), 37.3595, 127.1052, 260);
        assertTrue(a.buildings().size() > 10, "buildings " + a.buildings().size());
        assertTrue(a.roads().size() > 10, "roads " + a.roads().size());
        // 검색 좌표(네이버 그린팩토리) 위의 건물: 고층이어야 한다
        OsmConverter.Building hit = null;
        for (OsmConverter.Building b : a.buildings()) {
            assertTrue(OsmConverter.signedArea(b.poly()) < 0, "winding " + b.id());
            for (double v : b.poly()) assertTrue(Math.abs(v) < 2500, "local meters " + v);
            if (MvtAreaConverter.inside(0, 0, b.poly())) hit = b;
        }
        assertTrue(hit != null, "building at search point");
        assertTrue(hit.h() > 100, "green factory height " + hit.h());
        // 같은 id 가 두 번 나오지 않는다
        assertEquals(a.buildings().size(), a.buildings().stream().map(OsmConverter.Building::id).distinct().count());
        // 표시물: 이름 있는 가게가 있고, 점 좌표도 미터로 바뀐다
        assertTrue(a.pois().stream().anyMatch(p -> p.t().equals("shop") && p.name() != null), "shops");
        for (OsmConverter.Poi p : a.pois()) assertTrue(Math.hypot(p.x(), p.z()) < 700, "poi in range");
    }

    @Test
    void stitchesMultipolygonOuterPiecesIntoOneBuildingPerRing() throws Exception {
        // 고리 하나는 조각 두 개(하나는 거꾸로), 다른 고리는 한 조각 — 트윈타워 같은 모양
        String json = """
                [{"type":"relation","id":9,"tags":{"building":"office","height":"136","name":"트윈"},
                  "members":[
                   {"type":"way","role":"outer","geometry":[{"lat":37.0,"lon":127.0},{"lat":37.0,"lon":127.0003},{"lat":37.0003,"lon":127.0003}]},
                   {"type":"way","role":"outer","geometry":[{"lat":37.0,"lon":127.0},{"lat":37.0003,"lon":127.0},{"lat":37.0003,"lon":127.0003}]},
                   {"type":"way","role":"outer","geometry":[{"lat":37.0,"lon":127.0006},{"lat":37.0,"lon":127.0009},{"lat":37.0003,"lon":127.0009},{"lat":37.0003,"lon":127.0006},{"lat":37.0,"lon":127.0006}]},
                   {"type":"way","role":"inner","geometry":[{"lat":37.0001,"lon":127.0001},{"lat":37.0001,"lon":127.0002},{"lat":37.0002,"lon":127.0002},{"lat":37.0001,"lon":127.0001}]}
                  ]}]
                """;
        OsmConverter.AreaData a = OsmConverter.convert(om.readTree(json), 37.00015, 127.00045, 260);
        assertEquals(2, a.buildings().size());
        assertEquals("r9", a.buildings().get(0).id());
        assertEquals("r9-1", a.buildings().get(1).id());
        for (OsmConverter.Building b : a.buildings()) {
            assertEquals("트윈", b.name());
            assertEquals(136, b.h(), 1e-9);
            assertEquals(8, b.poly().length);
            assertTrue(OsmConverter.signedArea(b.poly()) < 0);
        }
    }

    @Test
    void heightFallbacks() throws Exception {
        assertEquals(45, OsmConverter.height(om.readTree("{\"height\":\"45 m\"}"), "yes", 0, 500, 1), 1e-9);
        double house = OsmConverter.height(om.readTree("{}"), "house", 0, 80, 7);
        assertTrue(house >= 5 && house <= 9);
        // 같은 id 면 항상 같은 높이
        assertEquals(OsmConverter.height(om.readTree("{}"), "yes", 0, 900, 42), OsmConverter.height(om.readTree("{}"), "yes", 0, 900, 42));
        assertEquals(3, OsmConverter.parseInt("3;4"));
        assertEquals(30.48, OsmConverter.parseDouble("100 ft"), 1e-6);
    }

    @Test
    void tileMathRoundTrips() {
        double lat = 37.3595, lng = 127.1052;
        int x = SmashAreaService.lngToX(lng), y = SmashAreaService.latToY(lat);
        assertTrue(SmashAreaService.xToLng(x) <= lng && lng < SmashAreaService.xToLng(x + 1));
        assertTrue(SmashAreaService.yToLat(y) >= lat && lat > SmashAreaService.yToLat(y + 1));
        List<int[]> tiles = SmashAreaService.tilesAround(lat, lng, 320);
        assertTrue(tiles.size() >= 4 && tiles.size() <= 16, "tiles " + tiles.size());
    }

    @Test
    void parsesKakaoAndNominatim() throws Exception {
        String kakao = """
                {"documents":[{"place_name":"네이버 그린팩토리","road_address_name":"경기 성남시 분당구 불정로 6",
                  "address_name":"경기 성남시 분당구 정자동 178-1","category_name":"서비스,산업 > 인터넷,IT > 포털","x":"127.1052","y":"37.3595"}]}
                """;
        String withParking = """
                {"documents":[{"place_name":"삼성전자빌딩 주차장","category_group_code":"PK6","x":"127","y":"37"},
                              {"place_name":"삼성전자빌딩","category_group_code":"","category_name":"부동산 > 빌딩","x":"127","y":"37"}]}
                """;
        List<SmashPlaceService.Place> filtered = SmashPlaceService.parseKakao(om.readTree(withParking));
        assertEquals(1, filtered.size());
        assertEquals("삼성전자빌딩", filtered.get(0).name());
        String onlyCafe = """
                {"documents":[{"place_name":"커피빈 본점","category_group_code":"CE7","x":"127","y":"37"}]}
                """;
        assertEquals(1, SmashPlaceService.parseKakao(om.readTree(onlyCafe)).size(), "다 걸러지면 원래 결과");

        SmashPlaceService.Place k = SmashPlaceService.parseKakao(om.readTree(kakao)).get(0);
        assertEquals("네이버 그린팩토리", k.name());
        assertEquals("경기 성남시 분당구 불정로 6", k.address());
        assertEquals("포털", k.category());
        assertEquals(37.3595, k.lat(), 1e-9);
        assertEquals(127.1052, k.lng(), 1e-9);
        assertTrue(k.company(), "서비스,산업 분류는 회사");
        assertTrue(filtered.get(0).company(), "사옥 건물(빌딩)도 회사로 본다");

        // 회사인지: 학교·관공서처럼 그룹 코드가 있으면 아니고, 이름에 (주)가 있으면 맞다
        assertFalse(SmashPlaceService.looksLikeCompany("칠곡중학교", "교육,학문 > 학교 > 중학교", "SC4"));
        assertFalse(SmashPlaceService.looksLikeCompany("수원시청", "사회,공공기관 > 행정기관 > 시청", "PO3"));
        assertFalse(SmashPlaceService.looksLikeCompany("래미안아파트", "부동산 > 주거시설 > 아파트", ""));
        assertTrue(SmashPlaceService.looksLikeCompany("(주)가나다", "부동산 > 빌딩", ""));
        assertTrue(SmashPlaceService.looksLikeCompany("미래에셋증권", "금융,보험 > 금융서비스 > 증권사", ""));
        assertTrue(SmashPlaceService.looksLikeCompany("NAVER그린팩토리", "부동산 > 빌딩", ""));
        assertFalse(SmashPlaceService.looksLikeCompany("인덕원역 4호선", "교통,수송 > 지하철,전철 > 수도권4호선", "SW8"));
        assertFalse(SmashPlaceService.looksLikeCompany("서울대학교병원", "의료,건강 > 병원 > 종합병원", "HP8"));

        // 네이버 지역 검색: <b> 태그 떼고, 좌표는 1e7 로 나눈다
        String nav = """
                {"items":[{"title":"<b>지비아이티</b>","category":"IT,컴퓨터>소프트웨어개발","address":"서울특별시 금천구 가산동 1","roadAddress":"서울특별시 금천구 가산디지털1로 1",
                           "mapx":"1268833000","mapy":"374800000"},
                          {"title":"좌표없음","category":"","address":"","roadAddress":"","mapx":"0","mapy":"0"}]}
                """;
        List<SmashPlaceService.Place> nv = SmashPlaceService.parseNaver(om.readTree(nav));
        assertEquals(1, nv.size(), "좌표가 이상한 곳은 뺀다");
        assertEquals("지비아이티", nv.get(0).name());
        assertEquals("서울특별시 금천구 가산디지털1로 1", nv.get(0).address());
        assertEquals("소프트웨어개발", nv.get(0).category());
        assertEquals(37.48, nv.get(0).lat(), 1e-9);
        assertEquals(126.8833, nv.get(0).lng(), 1e-9);
        assertTrue(nv.get(0).company());

        String nomi = """
                [{"name":"네이버 그린팩토리","display_name":"네이버 그린팩토리, 불정로, 정자동, 분당구, 성남시, 경기도, 13561, 대한민국",
                  "type":"office","lat":"37.3594","lon":"127.1051"}]
                """;
        SmashPlaceService.Place n = SmashPlaceService.parseNominatim(om.readTree(nomi)).get(0);
        assertEquals("네이버 그린팩토리", n.name());
        assertEquals("경기도 성남시 분당구 정자동 불정로", n.address());
        assertEquals(127.1051, n.lng(), 1e-9);
    }
}
