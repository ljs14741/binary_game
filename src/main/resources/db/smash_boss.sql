-- 회사 부수기 3D: 상사별 누적 응징 랭킹 (날린 횟수).
-- JPA 엔티티가 없어 ddl-auto 가 건드리지 않는다. 운영 DB(bitcoin)에 손으로 만든다.
-- 상사는 이름 + 직함으로 저장한다 ("김철수 부장님", 이름 6자·직함 8자). 회사 이름과는 묶지 않는다 (어느 회사 누구인지 안 드러나게).
CREATE TABLE IF NOT EXISTS smash_boss (
  smash_boss_id bigint NOT NULL AUTO_INCREMENT,
  label_key varchar(30) NOT NULL COMMENT '묶음용 이름(공백·기호·끝의 님 제거, 소문자)',
  display_label varchar(20) NOT NULL COMMENT '화면 표시 이름(처음 들어온 표기, 이름 + 직함)',
  total_hits bigint NOT NULL DEFAULT 0 COMMENT '누적 날린 횟수',
  play_count int NOT NULL DEFAULT 0 COMMENT '판 수',
  player_count int NOT NULL DEFAULT 0 COMMENT '날린 사람 수(서버 재시작 전까지 같은 사람은 하루 한 번만)',
  hidden tinyint(1) NOT NULL DEFAULT 0 COMMENT '랭킹 숨김(금칙어·관리자)',
  look varchar(300) NULL COMMENT '상사 꾸미기 모습 JSON (랭킹 옆 작은 그림용, 가장 최근 값)',
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (smash_boss_id),
  UNIQUE KEY uq_smash_boss_label_key (label_key),
  KEY idx_smash_boss_rank (hidden, total_hits)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회사 부수기 3D 상사별 누적';
