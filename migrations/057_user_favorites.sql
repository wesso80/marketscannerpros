-- 057: User favorites — per-workspace page bookmarks for custom dashboard
CREATE TABLE IF NOT EXISTS user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    page_key VARCHAR(60) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_fav_ws_page ON user_favorites(workspace_id, page_key);
CREATE INDEX IF NOT EXISTS idx_user_fav_ws_order ON user_favorites(workspace_id, display_order);
