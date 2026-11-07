-- Casi limite del conteggio delle INSERT del dump, letti sia da restore-test sia da
-- scripts/prova-ripristino.sh con gli stessi conteggi attesi: nessun dato reale.
-- Contano: audit 3, sessions 1, Mixed_Case1 1, _x 1, a_cf_b 1, _cfg 1, sqlitex 1. Le altre no.
PRAGMA defer_foreign_keys=TRUE;
-- commento: audit" ("id") con INSERT INTO "audit" a metà riga, non conta.
CREATE TABLE audit (id INTEGER);
INSERT INTO "audit" ("id") VALUES(1);
INSERT INTO "audit"("id") VALUES(2);
INSERT INTO "audit";
INSERT INTO "audit"x VALUES(9);
INSERT INTO audit VALUES(9);
 INSERT INTO "audit" ("id") VALUES(9);
INSERT INTO "" ("id") VALUES(9);
INSERT INTO "_cf_K V" ("k") VALUES(9);
INSERT INTO "sqlite_x-y" ("k") VALUES(9);
CREATE TABLE sessions (id INTEGER);
INSERT INTO "sessions" ("id") VALUES(1);
INSERT INTO "audit" ("note") VALUES('x CREATE INDEX y');
CREATE INDEXES_ARE_NOT_A_STOP;
CREATE TABLE Mixed_Case1 (id INTEGER);
INSERT INTO "Mixed_Case1" ("id") VALUES(1);
INSERT INTO "_x" ("id") VALUES(1);
INSERT INTO "a_cf_b" ("id") VALUES(1);
INSERT INTO "_cfg" ("id") VALUES(1);
INSERT INTO "sqlitex" ("id") VALUES(1);
INSERT INTO "(x
create unique index u on audit(id);
INSERT INTO "audit" ("id") VALUES(9);
INSERT INTO "audit log" ("id") VALUES(9);
