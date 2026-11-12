-- 회사 부수기 3D: 이달의 랭킹 (회사·상사). 2026-11-12 추가.
-- SmashMonthService 가 처음 쓸 때 CREATE TABLE IF NOT EXISTS 로 직접 만든다 (아래와 같은 내용).
-- 판별 기록이 없어 만들 때까지의 누적을 2026-11 기록으로 넣었다 (10월 기록이 적어서 사용자 결정).
-- 이름·동네·숨김·모습은 smash_company·smash_boss 에서 이어 붙여 쓴다.
CREATE TABLE IF NOT EXISTS smash_company_month (
  month_key int NOT NULL COMMENT '연월(202611)',
  name_key varchar(60) NOT NULL COMMENT 'smash_company.name_key',
  total_damage bigint NOT NULL DEFAULT 0,
  play_count int NOT NULL DEFAULT 0,
  player_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (month_key, name_key),
  KEY idx_smash_company_month_rank (month_key, total_damage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회사 부수기 3D 회사별 달 기록';

CREATE TABLE IF NOT EXISTS smash_boss_month (
  month_key int NOT NULL COMMENT '연월(202611)',
  label_key varchar(30) NOT NULL COMMENT 'smash_boss.label_key',
  total_hits bigint NOT NULL DEFAULT 0,
  play_count int NOT NULL DEFAULT 0,
  player_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (month_key, label_key),
  KEY idx_smash_boss_month_rank (month_key, total_hits)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회사 부수기 3D 상사별 달 기록';
