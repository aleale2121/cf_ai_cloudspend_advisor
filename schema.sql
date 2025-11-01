CREATE TABLE IF NOT EXISTS conversations (
  threadId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for ordering by creation time
CREATE INDEX IF NOT EXISTS idx_conversations_user_created
ON conversations (userId, createdAt DESC);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  role TEXT NOT NULL,          -- 'user' or 'assistant'
  content TEXT NOT NULL,       -- message text
  relevant INTEGER DEFAULT 0,  -- 1 = relevant, 0 = not relevant
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (threadId) REFERENCES conversations(threadId)
);

-- Index for faster chronological queries per thread
CREATE INDEX IF NOT EXISTS idx_messages_thread_created
ON messages (threadId, createdAt);


CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  threadId TEXT,               -- link to conversation (optional)
  plan TEXT NOT NULL,          -- uploaded plan/billing data
  metrics TEXT NOT NULL,       -- uploaded usage metrics data
  comment TEXT,                -- user message context
  result TEXT NOT NULL,        -- AI-generated analysis
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (threadId) REFERENCES conversations(threadId)
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_created
ON analyses (userId, createdAt DESC);