# Binary World - 웹게임 & 랜덤뽑기 포털

[https://game.binaryworld.kr/](https://game.binaryworld.kr/)

다양한 무료 웹게임과 랜덤뽑기 게임을 제공하는 포털 사이트입니다. 브라우저에서 바로 즐길 수 있습니다.

---

## 프로젝트 개요

| 구분 | 내용 |
|------|------|
| **프레임워크** | Spring Boot 3.2.5 |
| **언어** | Java 17 |
| **템플릿** | Thymeleaf |
| **DB** | MySQL 8 (JPA/Hibernate) |
| **인증** | Spring Security + OAuth2 (Kakao) |
| **빌드** | Gradle |
| **배포** | Docker / Docker Compose |

---

## 주요 기능

### 게임
- **총알 피하기** (`/dodge`) - 점수 저장 및 랭킹 (명예의 전당 Top10, 월별 Top30)
- **김치 디펜스** (`/kimchi`)
- **핀볼 랜덤 뽑기** (`/pinball`)
- **오목 게임** (`/omokGame`)

### 기타
- **방명록** - CRUD API, 페이징, 비밀번호 기반 삭제
- **방문자 카운트** - 일별/전체 방문자 통계
- **라이트/다크 테마** - localStorage 기반 테마 토글
- **SEO** - 메타태그, Open Graph, sitemap.xml, robots.txt

---

## 프로젝트 구조

```
game/
├── src/main/java/com/example/game/
│   ├── GameApplication.java          # 메인 애플리케이션
│   ├── controller/                   # 컨트롤러
│   │   ├── MainController.java       # 메인, about, privacy-policy, contact
│   │   ├── GameController.java       # 게임 페이지, 점수 API, 랭킹
│   │   ├── GuestbookController.java  # 방명록 REST API
│   │   └── VisitorController.java    # 방문자 관련
│   ├── service/                      # 비즈니스 로직
│   ├── repository/                   # JPA 리포지토리
│   ├── entity/                       # 엔티티 (GameScore, Guestbook, TotalVisitor 등)
│   ├── dto/                          # DTO
│   └── common/                       # SecurityConfig, WebMvcConfig, WebSocket 등
├── src/main/resources/
│   ├── templates/                    # Thymeleaf 템플릿
│   ├── static/                       # CSS, JS, 이미지
│   └── application.yml               # 설정 (gitignore 대상)
├── Dockerfile
├── docker-compose.yml
└── build.gradle
```

---

## 실행 방법

### 사전 요구사항
- JDK 17
- MySQL 8
- (선택) Docker

### 1. 설정 파일 생성

`application.yml`은 민감 정보(DB, OAuth)를 포함하므로 gitignore 대상입니다.  
프로젝트 루트에 `src/main/resources/application.yml` 파일을 생성하고 다음 형식으로 설정하세요.

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:mysql://localhost:3306/bitcoin?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Seoul&characterEncoding=UTF-8
    username: your_username
    password: your_password
  jpa:
    hibernate:
      ddl-auto: update
  # Kakao OAuth (선택)
  security:
    oauth2:
      client:
        registration:
          kakao:
            client-id: your_client_id
            client-secret: your_client_secret
```

### 2. 로컬 실행

```bash
# MySQL 실행 후
./gradlew bootRun
```

브라우저에서 http://localhost:8080 접속

### 3. Docker 실행

```bash
./gradlew build
docker-compose up -d
```

포트 8081에서 접속 (호스트 8081 → 컨테이너 8080)

---

## API 엔드포인트

| Method | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 메인 페이지 |
| GET | `/dodge` | 총알 피하기 게임 |
| GET | `/kimchi` | 김치 디펜스 |
| GET | `/pinball` | 핀볼 랜덤 뽑기 |
| POST | `/api/scores` | 게임 점수 저장 |
| GET | `/api/scores/leaderboards` | 랭킹 조회 |
| GET | `/api/guestbook` | 방명록 목록 |
| POST | `/api/guestbook` | 방명록 등록 |
| DELETE | `/api/guestbook/{id}` | 방명록 삭제 |
| GET | `/api/guestbook/paged` | 방명록 페이징 조회 |

---

## 배포

- **플랫폼**: AWS EC2
- **런타임**: OpenJDK 17 컨테이너
- **볼륨**: `/home/uploads` (업로드 파일 저장)
- **환경 변수**: `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` 등

---

## 라이선스

이 프로젝트의 라이선스는 별도로 정의되지 않았습니다.
