-- 2026-10-29 동네 대항전: 회사가 있는 동네 칸 (운영 DB 에 한 번 실행)
ALTER TABLE smash_company ADD COLUMN region varchar(15) NULL COMMENT '동네(구로구, 서울 중구 등)' AFTER hidden, ADD KEY idx_smash_company_region (region, hidden, total_damage)
