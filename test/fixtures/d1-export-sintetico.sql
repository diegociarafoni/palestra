-- Dump sintetico nel formato di `wrangler d1 export` (dumpSql di D1): nessun dato reale.
PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note TEXT
);
INSERT INTO "audit" ("id","note") VALUES(1,'dato-personale');
INSERT INTO "audit" ("id","note") VALUES(2,'l''apostrofo');
INSERT INTO "audit" ("id","note") VALUES(3,replace('prima riga\nINSERT INTO "audit" ("id") VALUES(9);','\n',char(10)));
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY,
  note TEXT
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  data BLOB
);
INSERT INTO "sessions" ("id","data") VALUES('s1',X'00ff');
INSERT INTO "sessions" ("id","data") VALUES('s2',NULL);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('audit',3);
CREATE INDEX audit_note ON audit(note);
CREATE TRIGGER feedback_audit AFTER INSERT ON feedback BEGIN
INSERT INTO "audit" ("note") VALUES('trigger');
END;
