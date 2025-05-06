# 도커가 사용할 기본 이미지
FROM openjdk:17-jdk-slim

# 컨테이너 내부에서 /app이라는 작업 디레토리를 설정. 이후 명령들은 이 디렉토리를 기준으로 싱행됨
WORKDIR /app

# war파일을 컨테이너 내부의 /app 디렉토리로 1
COPY build/libs/bitcoin-0.0.1-SNAPSHOT.war /app/bitcoin.war

# 커스텀 에러 페이지 파일을 Nginx 경로로 복사
COPY src/main/resources/templates/error/*.html /usr/share/nginx/html/

# timezone 환경설정
ENV TZ=Asia/Seoul

# War 파일 실행
CMD ["java", "-jar", "-Duser.timezone=Asia/Seoul", "/app/bitcoin.war"]



####### 오늘의 운세 - 웹크롤링 하려면 아래꺼 사용하면 됨 / BUT 용량 많이 잡아먹고 서버올리는데 시간 걸리고 잠시 중단

# 필수 패키지 업데이트 및 설치
#RUN apt-get update && apt-get install -y \
#    wget \
#    unzip \
#    chromium \
#    libgconf-2-4 \
#    ca-certificates \
#    && rm -rf /var/lib/apt/lists/*


# Chrome 다운로드 및 설치
#RUN mkdir -p /opt/google/chrome \
#    && wget -O /tmp/chrome-linux64.zip https://storage.googleapis.com/chrome-for-testing-public/129.0.6668.70/linux64/chrome-linux64.zip \
#    && unzip /tmp/chrome-linux64.zip -d /opt/google/chrome/ \
#    && ln -s /opt/google/chrome/chrome-linux64/chrome /usr/bin/google-chrome \
#    && rm /tmp/chrome-linux64.zip

# ChromeDriver 다운로드 및 설치
#RUN wget -O /tmp/chromedriver-linux64.zip https://storage.googleapis.com/chrome-for-testing-public/129.0.6668.70/linux64/chromedriver-linux64.zip \
#    && unzip /tmp/chromedriver-linux64.zip -d /usr/local/bin/ \
#    && chmod +x /usr/local/bin/chromedriver-linux64/chromedriver \
#    && rm /tmp/chromedriver-linux64.zip