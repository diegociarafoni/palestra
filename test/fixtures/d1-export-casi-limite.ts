// Casi del conteggio delle INSERT del dump letti sia dai test di restore-test sia da quelli di
// scripts/prova-ripristino.sh, con gli stessi esiti attesi: una divergenza fra le due
// implementazioni su questi casi fa fallire un test. Non coprono ogni combinazione di spazi:
// SQLite riscrive l'inizio di CREATE INDEX/TRIGGER/VIEW con spazi singoli. I casi su un dump
// intero stanno nel file .sql.

/** Righe che, dopo i dati, fermano il conteggio: le INSERT successive non contano. */
export const STOP_LINES = [
  "CREATE INDEX i ON audit(id);",
  "create unique index u on audit(id);",
  "CREATE TRIGGER t AFTER INSERT ON audit BEGIN",
  'CREATE VIEW "v" AS SELECT 1;',
  "CREATE\tTRIGGER t AFTER INSERT ON audit BEGIN",
  "CREATE TRIGGER\r",
  "CREATE\fVIEW v AS SELECT 1;",
  "CREATE UNIQUE\vINDEX u ON audit(id);",
  "CREATE \t\r\f\vUNIQUE \t\r\f\vINDEX\ti ON audit(id);",
  "CREATE VIEW\fv AS SELECT 1;",
  "CREATE TRIGGER\vt AFTER INSERT ON audit BEGIN",
];

/** Nomi di tabella del dump che non sono identificatori semplici: exit 65 prima di creare. */
export const BAD_NAMES = ["dato personale", "1abc", "a-b", "a.b", "a$b"];
