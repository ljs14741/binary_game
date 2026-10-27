-- 2026-10-28 상사 응징 랭킹에 상사 모습을 그리려고 꾸미기 값 칸 추가 (운영 DB 에 한 번 실행)
ALTER TABLE smash_boss ADD COLUMN look varchar(300) NULL COMMENT '상사 꾸미기 모습 JSON (랭킹 옆 작은 그림용, 가장 최근 값)' AFTER hidden
