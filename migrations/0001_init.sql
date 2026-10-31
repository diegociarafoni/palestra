-- Schema iniziale del database D1 "palestra": colonne e autori in scheda/SCHEMA.md § 0.
-- Date `YYYY-MM-DD`, istanti ISO 8601 e JSON sono TEXT. Le chiavi primarie TEXT
-- hanno NOT NULL esplicito: in SQLite solo INTEGER PRIMARY KEY lo implica.

-- Sedute Mywellness normalizzate (scrive solo la sync). `date` è la data in Europe/Rome.
CREATE TABLE sessions (
  session_id TEXT NOT NULL PRIMARY KEY,
  date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX sessions_date ON sessions (date);

-- Serie temporali per esercizio: `ord` = exercises[].order della seduta.
CREATE TABLE timeseries (
  session_id TEXT NOT NULL REFERENCES sessions (session_id),
  ord INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (session_id, ord)
);

CREATE TABLE measures (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX measures_date ON measures (date);

-- Una riga per settimana ISO (`YYYY-Www`).
CREATE TABLE recovery (
  week TEXT NOT NULL PRIMARY KEY,
  json TEXT NOT NULL
);

-- Slot programmati: id = "<week>-<slot>", window_days = array JSON di date.
CREATE TABLE planned_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  week TEXT NOT NULL,
  slot INTEGER NOT NULL,
  window_days TEXT NOT NULL,
  date TEXT,
  scheda_day TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('programmata', 'fatta', 'spostata', 'da_confermare', 'saltata')),
  reason TEXT,
  session_id TEXT,
  UNIQUE (week, slot)
);
CREATE INDEX planned_sessions_week ON planned_sessions (week);

-- Un feedback per seduta: `seq` = ordine della seduta nel giorno, 1 = la prima.
-- Nessuna chiave esterna: il feedback può arrivare prima della seduta o dello slot.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY,
  planned_id TEXT UNIQUE,
  session_id TEXT UNIQUE,
  date TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 1 CHECK (seq >= 1),
  class TEXT NOT NULL
    CHECK (class IN ('ottima', 'buona', 'normale', 'faticosa', 'pessima')),
  joint_pain INTEGER NOT NULL CHECK (joint_pain IN (0, 1)),
  joint_where TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (date, seq)
);

CREATE TABLE profile (
  key TEXT NOT NULL PRIMARY KEY,
  json TEXT NOT NULL
);

-- Una riga per versione (`AAAA-MM`): `json` e `md` cambiano sempre insieme.
CREATE TABLE scheda (
  version TEXT NOT NULL PRIMARY KEY,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  json TEXT NOT NULL,
  md TEXT NOT NULL
);

CREATE TABLE reports (
  month TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('report', 'revisione')),
  md TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (month, kind)
);

CREATE TABLE metrics (
  month TEXT NOT NULL,
  key TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (month, key)
);

-- Una riga per ogni scrittura manuale (dashboard o connettore).
CREATE TABLE audit (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete'))
);
