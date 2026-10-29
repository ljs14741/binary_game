-- 회사 부수기 3D: 회사별 누적 피해액 랭킹.
-- 운영 DB(bitcoin)에 직접 만들었다 (2026-10-24). JPA 엔티티가 없어 ddl-auto 가 건드리지 않는다.
-- 회사 이름은 사용자가 입력한 그대로만 저장한다 (카카오 장소 정보·상사 이름은 저장하지 않는다).
CREATE TABLE IF NOT EXISTS smash_company (
  smash_company_id bigint NOT NULL AUTO_INCREMENT,
  name_key varchar(60) NOT NULL COMMENT '묶음용 이름(공백·㈜·주식회사·기호 제거, 소문자)',
  display_name varchar(40) NOT NULL COMMENT '화면 표시 이름(처음 입력된 표기)',
  total_damage bigint NOT NULL DEFAULT 0 COMMENT '누적 피해액(억 원)',
  play_count int NOT NULL DEFAULT 0 COMMENT '판 수',
  player_count int NOT NULL DEFAULT 0 COMMENT '부순 사람 수(서버 재시작 전까지 같은 사람은 하루 한 번만)',
  hidden tinyint(1) NOT NULL DEFAULT 0 COMMENT '랭킹 숨김(금칙어·관리자)',
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (smash_company_id),
  UNIQUE KEY uq_smash_company_name_key (name_key),
  KEY idx_smash_company_rank (hidden, total_damage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회사 부수기 3D 회사별 누적';

-- 2026-10-29 동네 대항전: 회사가 있는 동네(구·군·시)
-- ALTER TABLE smash_company ADD COLUMN region varchar(15) NULL COMMENT '동네(구로구, 서울 중구 등)' AFTER hidden, ADD KEY idx_smash_company_region (region, hidden, total_damage);
