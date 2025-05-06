# 도커가 사용할 기본 이미지
FROM openjdk:17-jdk-slim

# 컨테이너 내부에서 /app이라는 작업 디레토리를 설정. 이후 명령들은 이 디렉토리를 기준으로 싱행됨
WORKDIR /app

# war파일을 컨테이너 내부의 /app 디렉토리로 1
COPY build/libs/game-0.0.1-SNAPSHOT.war /app/game.war

# 커스텀 에러 페이지 파일을 Nginx 경로로 복사
COPY src/main/resources/templates/error/*.html /usr/share/nginx/html/

# timezone 환경설정
ENV TZ=Asia/Seoul

# War 파일 실행
CMD ["java", "-jar", "-Duser.timezone=Asia/Seoul", "/app/game.war"]