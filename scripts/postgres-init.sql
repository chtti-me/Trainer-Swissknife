-- 培訓師瑞士刀 v4.0 — 本機 PostgreSQL 初始化
-- docker-compose 啟動時自動執行（僅首次建容器時）

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
