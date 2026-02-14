CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  domain TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  is_starred INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  read_at INTEGER,
  archived_at INTEGER,
  CONSTRAINT items_status_check CHECK (status IN ('unread', 'read', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS items_url_unique ON items(url);
CREATE INDEX IF NOT EXISTS idx_items_status_created ON items(status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at, id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_unique ON tags(name);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(item_id, tag_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_tags_tag_item ON item_tags(tag_id, item_id);

CREATE TABLE IF NOT EXISTS notes (
  item_id INTEGER PRIMARY KEY NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
