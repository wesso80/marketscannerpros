-- 092_pgvector_analogues.sql
-- Add pgvector embedding column to edge_ledger_setups for analogue search.
--
-- pgvector is OPTIONAL. If the extension is not installed (or the role
-- lacks permission), this migration skips creating the column without
-- failing. Downstream code checks for column existence at runtime.
--
-- Embedding dimension: 32 (small, fast, derived from numeric features —
-- no LLM embedding API needed). See lib/analogues/featureEmbedding.ts.

DO $$
BEGIN
  -- Try to create extension; ignore failure (e.g. permission denied)
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not available — analogue search will be disabled';
  END;

  -- Only add column if vector type exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    BEGIN
      ALTER TABLE edge_ledger_setups
        ADD COLUMN IF NOT EXISTS feature_embedding vector(32);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not add feature_embedding column: %', SQLERRM;
    END;

    -- ivfflat index — cosine distance — only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'edge_ledger_setups' AND column_name = 'feature_embedding'
    ) THEN
      BEGIN
        CREATE INDEX IF NOT EXISTS edge_setups_embedding_idx
          ON edge_ledger_setups
          USING ivfflat (feature_embedding vector_cosine_ops)
          WITH (lists = 50);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create ivfflat index: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;
