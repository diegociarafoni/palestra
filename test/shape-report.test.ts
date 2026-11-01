import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import {
  checkReport,
  DATE_ABBREVIATIONS,
  DATE_WORDS,
  main,
  maskText,
  shapeContext,
  shapeOfHtml,
  shapeOfJson,
  VOCAB,
} from "../scripts/shape-report";

// Identità inventate, nella forma di identities.json scritto dal probe.
const EMAIL = "mario.rossi@example.com";
const USER_ID = "3f2a9c1e-7b4d-4e8a-9c6f-1d2e3f4a5b6c";
const TOKEN = "tok-di-prova-0123456789";
const COOKIE = "c00k1e-di-prova-lungo-0123";
const IDENTITIES = [
  EMAIL,
  USER_ID,
  TOKEN,
  "3f2a9c1e7b4d4e8a9c6f1d2e3f4a5b6c",
  "Mario",
  "Rossi",
  COOKIE,
];
const ctx = shapeContext(IDENTITIES);

let dir: string;
let stdout: MockInstance;
let stderr: MockInstance;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shape-"));
  stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
  stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

/** Una cartella come probe_out/: identities.json più i file dati. */
function probeOut(files: Record<string, string>, identities = IDENTITIES) {
  const src = join(dir, "probe_out");
  mkdirSync(src);
  writeFileSync(join(src, "identities.json"), JSON.stringify(identities));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(src, name), text);
  }
  return src;
}

describe("shape", () => {
  it("shape: masks every value", () => {
    const lines = shapeOfJson(
      {
        email: EMAIL,
        userId: USER_ID,
        name: "Mario Rossi",
        token: TOKEN,
        cookie: `_mwappseu=${COOKIE}`,
        startedOn: "2026-10-26 18:30:00 +01:00",
        endedOn: "2026-10-29T18:30:00Z",
        load: 60,
        done: true,
        note: null,
      },
      ctx,
    );
    expect(lines).toEqual([
      'email: "a.a@a.a"',
      'userId: "99a99a99a99a-99a99a-99a99a-99a99a-99a99a99a99a99a99a"',
      'name: "A A"',
      'token: "a-a-a-9999999999"',
      'cookie: "_a=a99a99a-a-a-a-9999"',
      'startedOn: "9999-99-99 99:99:99 +99:99"',
      'endedOn: "9999-99-99T99:99:99Z"',
      "load: numero 9",
      "done: booleano",
      "note: null",
    ]);
    const text = lines.join("\n").toLowerCase();
    for (const leak of [
      "mario",
      "rossi",
      "example",
      "2026",
      USER_ID,
      TOKEN,
      COOKIE,
      "60",
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("shape: keeps vocabulary words and units", () => {
    expect(maskText("12,5 km", VOCAB)).toBe("99,99 km");
    expect(maskText("1.234 MOVEs", VOCAB)).toBe("99.999 MOVEs");
    expect(maskText("Serie", VOCAB)).toBe("Serie");
    expect(maskText("Velocità media", VOCAB)).toBe("Velocità a");
    // Nessun nome di mese o di giorno nel vocabolario: le date a parole restano mascherate.
    expect(maskText("29 ottobre 2026", VOCAB)).toBe("99 a 9999");
    // Oltre 20 cifre: 20 `9` e `…`.
    expect(maskText(`/Date(${"1".repeat(25)})/`, VOCAB)).toBe(
      `/A(${"9".repeat(20)}…)/`,
    );
    // Il vocabolario lo rivede l'utente: ogni parola in più esce in chiaro.
    expect(VOCAB).toEqual([
      "bpm",
      "cal",
      "calorie",
      "calories",
      "cardio",
      "carico",
      "cm",
      "compliance",
      "distance",
      "distanza",
      "done",
      "durata",
      "duration",
      "eseguita",
      "eseguite",
      "eseguiti",
      "forza",
      "gmt",
      "kcal",
      "kg",
      "kj",
      "km",
      "lb",
      "level",
      "livello",
      "load",
      "min",
      "move",
      "moves",
      "peso",
      "potenza",
      "power",
      "prevista",
      "previste",
      "previsti",
      "rep",
      "reps",
      "rip",
      "ripetizioni",
      "rpm",
      "sec",
      "serie",
      "sets",
      "speed",
      "spm",
      "strength",
      "target",
      "tempo",
      "time",
      "utc",
      "velocita",
      "watt",
      "weight",
    ]);
    expect(shapeContext(IDENTITIES).vocab).toEqual(VOCAB);
    // Una parola del vocabolario che è anche parola di un'identità si maschera.
    const surname = shapeContext(["Mario Tempo", "mario.tèmpo@example.com"]);
    expect(surname.vocab).not.toContain("tempo");
    expect(maskText("Tempo: 99", surname.vocab)).toBe("A: 99");
  });

  it("shape: digit counts do not show magnitudes", () => {
    expect(
      shapeOfJson({ a: 7, b: 120, c: 81.5, d: -3, e: -0.25, f: 1e21 }, ctx),
    ).toEqual([
      "a: numero 9",
      "b: numero 9",
      "c: numero 9.9",
      "d: numero -9",
      "e: numero -9.9",
      "f: numero 9",
    ]);
    // Nei testi 1 o 2 cifre diventano `99`; da 3 a 20 restano lunghe quanto sono.
    expect(maskText("7 kg", VOCAB)).toBe("99 kg");
    expect(maskText("60 kg", VOCAB)).toBe("99 kg");
    expect(maskText("1/11/2026 8:30", VOCAB)).toBe("99/99/9999 99:99");
    expect(maskText("2026-11-01", VOCAB)).toBe("9999-99-99");
    expect(maskText("123", VOCAB)).toBe("999");
  });

  it("shape: no month or weekday in the vocabulary", () => {
    // "set" è settembre in it-IT: resta mascherato, mentre "sets" e "serie" restano scritti.
    expect([...DATE_ABBREVIATIONS].sort()).toEqual([
      "ago",
      "apr",
      "aug",
      "dec",
      "dic",
      "dom",
      "feb",
      "fri",
      "gen",
      "gio",
      "giu",
      "jan",
      "jul",
      "jun",
      "lug",
      "lun",
      "mag",
      "mar",
      "may",
      "mer",
      "mon",
      "nov",
      "oct",
      "ott",
      "sab",
      "sat",
      "sep",
      "sept",
      "set",
      "sett",
      "sun",
      "thu",
      "thur",
      "thurs",
      "tue",
      "tues",
      "ven",
      "wed",
    ]);
    expect(
      VOCAB.filter(
        (word) => DATE_WORDS.has(word) || DATE_ABBREVIATIONS.has(word),
      ),
    ).toEqual([]);
    expect(maskText("29 set 2026", VOCAB)).toBe("99 a 9999");
    expect(maskText("3 sets, Serie", VOCAB)).toBe("99 sets, Serie");
    // Il controllo finale trova anche le abbreviazioni, tra confini di lettera.
    expect(
      checkReport(
        [
          "a set a",
          "Sett",
          "ott.",
          "a tues a",
          "THURS",
          "a dom a",
          "sets",
          "settings",
        ],
        [],
      ),
    ).toEqual([
      { line: 1, kind: "date" },
      { line: 2, kind: "date" },
      { line: 3, kind: "date" },
      { line: 4, kind: "date" },
      { line: 5, kind: "date" },
      { line: 6, kind: "date" },
    ]);
  });

  it("shape: arrays show distinct shapes without counts", () => {
    // Tre campioni con la stessa forma: una riga sola, senza la lunghezza della lista.
    const samples = [
      { t: 1, hr: 120 },
      { t: 2, hr: 121 },
      { t: 3, hr: 122 },
    ];
    expect(shapeOfJson({ samples, empty: [], none: {} }, ctx)).toEqual([
      "samples:",
      "  - t: numero 9",
      "    hr: numero 9",
      "empty: []",
      "none: {}",
    ]);
    // Le forme diverse nell'ordine in cui compaiono, al massimo 5.
    expect(shapeOfJson([1, 2.5, "x", 3, [true], null, {}, false], ctx)).toEqual(
      [
        "- numero 9",
        "- numero 9.9",
        '- "a"',
        "- - booleano",
        "- null",
        "… altre varianti",
      ],
    );
  });

  it("shape: masks data-like keys and identity keys", () => {
    const lines = shapeOfJson(
      {
        "2026-10-29": { hr2: 120 },
        "2026-10-30": { hr2: 118 },
        "2026-10-31": "riposo",
        "123456": "x",
        u123456: "x",
        // Un id esadecimale può non avere 3 cifre di fila: contano le cifre in tutto.
        ab1c2d3e4f: "x",
        Rossi: 1,
        marioRossi: 2,
        "user name": 3,
        hr2: 5,
      },
      ctx,
    );
    // Le chiavi numeriche vengono prima in ogni oggetto JavaScript (anche da JSON.parse).
    // Le chiavi mascherate consecutive con la stessa forma diventano una riga, senza conteggio.
    expect(lines).toEqual([
      '«999999»: "a"',
      "«9999-99-99»:",
      "  hr2: numero 9",
      '«9999-99-99»: "a"',
      '«a999999»: "a"',
      '«a99a99a99a99a»: "a"',
      "«A»: numero 9",
      "«a»: numero 9",
      "«a a»: numero 9",
      "hr2: numero 9",
    ]);
  });

  it("shape: keeps the property names the parser reads", () => {
    // normalize.ts sceglie i valori per `physicalProperty` e `property` (es. "HDistance"):
    // solo lì il valore resta scritto, se ha la forma di un nome senza spazi.
    const lines = shapeOfJson(
      [
        { physicalProperty: "HDistance", name: "Hr", rawValue: 1.2 },
        { property: "AvgRpm" },
        { physicalProperty: "Mario" },
        { property: "Leg Press" },
        { property: "ab1c2d3" },
      ],
      ctx,
    );
    expect(lines).toEqual([
      '- physicalProperty: "HDistance"',
      '  name: "A"',
      "  rawValue: numero 9.9",
      '- property: "AvgRpm"',
      '- physicalProperty: "A"',
      '- property: "A A"',
      '- property: "a99a99a99"',
    ]);
  });

  it("shape: json inside a string", () => {
    const lines = shapeOfJson(
      {
        payload: JSON.stringify({ id: USER_ID, sets: [{ kg: 60 }] }),
        list: "[1,2]",
        empty: "{}",
        text: "{non json",
        number: "123",
      },
      ctx,
    );
    expect(lines).toEqual([
      "payload: json in stringa:",
      '  id: "99a99a99a99a-99a99a-99a99a-99a99a-99a99a99a99a99a99a"',
      "  sets:",
      "    - kg: numero 9",
      "list: json in stringa:",
      "  - numero 9",
      "empty: json in stringa:",
      "  {}",
      'text: "{a a"',
      'number: "999"',
    ]);
    expect(shapeOfJson('["Mario"]', ctx)).toEqual([
      "json in stringa:",
      '  - "A"',
    ]);
  });

  it("shape: html tree", () => {
    const html = [
      "<!DOCTYPE html>",
      '<html lang="it">',
      "<head>",
      '<script src="/js/app.js?v=20261029">var who = "Mario Rossi";</script>',
      "<style>.mario { color: red }</style>",
      "</head>",
      "<body>",
      "<!-- Mario Rossi, 29 ottobre -->",
      String.raw`<script type="text/javascript">EU.currentUser = JSON.parse('{\"id\":\"${USER_ID}\",\"firstName\":\"Mario\",\"weight\":81.5}'); var since = "2026-10-29";</script>`,
      `<a class="profile-link" href="/cloud/User/${USER_ID}">Mario Rossi</a>`,
      '<table class="sets">',
      "<tr><th>Serie</th><th>Ripetizioni</th><th>Carico</th></tr>",
      "<tr><td>1</td><td>12</td><td>60</td></tr>",
      "<tr><td>2</td><td>12</td><td>60</td></tr>",
      "<tr><td>3</td><td>10</td><td>55</td></tr>",
      "</table>",
      '<input type="hidden" name="hdSessionIdCR" value="9001">',
      '<div id="mario-box" data-user="Mario" role="note" hidden>Ciao Mario!</div>',
      "</body>",
      "</html>",
    ].join("\n");
    const lines = shapeOfHtml(html, ctx);
    expect(lines).toEqual([
      '"<!A a>"',
      "html[lang=«a»]",
      "  head",
      "    script[src=«/a/a.a?a=99999999»]",
      "      (contenuto omesso)",
      "    style",
      "      (contenuto omesso)",
      "  body",
      "    script[type=«a/a»]",
      "      EU.currentUser:",
      '        id: "99a99a99a99a-99a99a-99a99a-99a99a-99a99a99a99a99a99a"',
      '        firstName: "A"',
      "        weight: numero 9.9",
      "    a[class=profile-link, href=«/a/A/99a99a99a99a-99a99a-99a99a-99a99a-99a99a99a99a99a99a»]",
      '      "A A"',
      "    table[class=sets]",
      "      tr",
      "        th",
      '          "Serie"',
      "        th",
      '          "Ripetizioni"',
      "        th",
      '          "Carico"',
      // Anche le celle consecutive uguali: 1, 12 e 60 hanno la stessa forma.
      "      tr (ripetuto)",
      "        td (ripetuto)",
      '          "99"',
      "    input[type=hidden, name=hdSessionIdCR, value=«9999»]",
      "    div[id=«a-a», data-user=«A», role=note, hidden]",
      '      "A A!"',
    ]);
    const text = lines.join("\n").toLowerCase();
    for (const leak of ["mario", "rossi", "ottobre", "2026", "app", "who"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("shape: encodings cannot leak", () => {
    expect(maskText("&#77;ario", VOCAB)).toBe("&#99;a");
    expect(maskText("\\u004dario", VOCAB)).toBe("\\a999a");
    expect(maskText("%4Dario", VOCAB)).toBe("%99A");
    // Caratteri invisibili (\p{Cf}): spazio di larghezza zero, trattino morbido, BOM.
    expect(maskText("Ma\u200Brio", VOCAB)).toBe("A");
    expect(maskText("Ma\u00ADrio", VOCAB)).toBe("A");
    expect(maskText("\uFEFFMario", VOCAB)).toBe("A");
    // Cifre a larghezza piena (NFKC), arabo-indiane e numeri non decimali (etiopici).
    expect(maskText("２０２６", VOCAB)).toBe("9999");
    expect(maskText("٢٠٢٦", VOCAB)).toBe("9999");
    expect(maskText("\u1372\u1371", VOCAB)).toBe("99");
    // Caratteri di controllo come spazi: un NUL farebbe saltare il file a check-public-tree.
    expect(maskText("Ma\u0000rio\u0007", VOCAB)).toBe("A a ");
  });

  it("shape: final check fails closed", async () => {
    const lines = [
      'name: "Mario A"',
      "class=x-ROSSI",
      'url: "xmario.rossix"',
      'id: "x3F2A9C1E-7B4D-4E8A-9C6F-1D2E3F4A5B6Cx"',
      'id: "3f2a9c1e7b4d4e8a9c6f1d2e3f4a5b6c"',
      "a xtok-di-prova-0123456789x a",
      'card: "9999999"',
      'card: "99999999"',
      'card: "a9999999a"',
      "numero 120",
      "numero 999.99",
      '"29 Ottobre"',
      "Lunedì",
      "a may a",
      "mayday",
      '"a.a@a.a"',
      "Ma\u200Brio",
    ];
    expect(checkReport(lines, [...IDENTITIES, "9999999"])).toEqual([
      { line: 1, kind: "identity" },
      { line: 2, kind: "identity" },
      { line: 3, kind: "identity" },
      { line: 4, kind: "identity" },
      { line: 5, kind: "identity" },
      { line: 6, kind: "identity" },
      { line: 6, kind: "number" },
      { line: 7, kind: "identity" },
      { line: 9, kind: "identity" },
      { line: 10, kind: "number" },
      { line: 12, kind: "date" },
      { line: 13, kind: "date" },
      { line: 14, kind: "date" },
      { line: 17, kind: "identity" },
    ]);
    // Un'identità vuota non rende sospetta ogni riga.
    expect(checkReport(['name: "A A"'], [""])).toEqual([]);

    // Un vocabolario sbagliato lascia passare un nome: il controllo non scrive nulla.
    const src = probeOut({ "login_ok.html": "<p>Mario Rossi</p>" });
    const dest = join(dir, "forma.md");
    expect(await main([src, dest], { vocab: [...VOCAB, "mario"] })).toBe(65);
    expect(existsSync(dest)).toBe(false);
    expect(stderr.mock.calls).toEqual([["login_ok.html:2: identity"]]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("shape: cli", async () => {
    const usage =
      "Uso: npx tsx scripts/shape-report.ts <cartella_probe> <file_md>";
    expect(await main([])).toBe(64);
    expect(await main(["probe_out"])).toBe(64);
    expect(await main(["probe_out", "a.md", "b.md"])).toBe(64);
    expect(stderr.mock.calls).toEqual([[usage], [usage], [usage]]);
    stderr.mockClear();

    // Senza identities.json non c'è controllo finale: niente rapporto.
    const empty = join(dir, "vuota");
    mkdirSync(empty);
    const dest = join(dir, "forma.md");
    expect(await main([empty, dest])).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [`identities.json mancante in ${empty}: eseguire prima il probe`],
    ]);
    writeFileSync(join(empty, "identities.json"), '{"email":"x"}');
    expect(await main([empty, dest])).toBe(65);
    expect(stderr.mock.calls.at(-1)).toEqual([
      "identities.json non valido: serve un array di stringhe",
    ]);
    expect(existsSync(dest)).toBe(false);
    stderr.mockClear();

    const table = (set: number, kg: number) =>
      `<table class="sets"><tr><th>Serie</th><th>Kg</th></tr><tr><td>${set}</td><td>${kg}</td></tr></table>`;
    const src = probeOut({
      "biometrics.json": JSON.stringify({
        data: {
          lastMeasurements: [
            {
              measuredOn: "2026-10-20 10:24:00 +02:00",
              value: 81.5,
              unitOfMeasure: "kg",
              name: "Weight",
            },
          ],
        },
      }),
      "strength_detail.html": table(1, 60),
      "strength_detail_2.html": table(2, 55),
      // Fuori elenco: la seduta grezza e una seconda serie cardio.
      "session_1.json": '{"data":{}}',
      "cardio_timeseries_2.json": "{}",
    });
    expect(await main([src, dest])).toBe(0);
    expect(readFileSync(dest, "utf8")).toBe(
      [
        "# Forma dei dati di Mywellness",
        "",
        "File generato da `scripts/shape-report.ts` (Task 0) con le risposte del probe, che restano sul computer dell'utente. Mostra solo la forma dei dati:",
        "",
        "- restano scritti i nomi dei campi JSON, dei tag e degli attributi HTML e i valori di attributi come `class`, `id` e `name` e dei campi `physicalProperty` e `property`, se hanno la forma di un nome; gli altri sono mascherati tra `«»`;",
        "- nei valori ogni parola diventa `a` (se comincia con una minuscola) o `A` (se comincia con una maiuscola) e ogni cifra diventa `9`;",
        "- restano scritte solo le parole del vocabolario `VOCAB` dello script (unità di misura, parole della tabella delle serie e dell'interfaccia, tipi di esercizio), la punteggiatura, i simboli e la `T` e la `Z` delle date ISO;",
        "- liste e righe ripetute (`(ripetuto)`) non dicono quanti elementi hanno; il contenuto degli script è omesso, tranne la forma di `EU.currentUser`.",
        "",
        "Nient'altro: nessun nome, data, numero o identificativo.",
        "",
        "## strength_detail.html",
        "",
        "```text",
        "table[class=sets]",
        "  tr",
        "    th",
        '      "Serie"',
        "    th",
        '      "Kg"',
        "  tr",
        "    td (ripetuto)",
        '      "99"',
        "```",
        "",
        "## strength_detail_2.html",
        "",
        "Uguale a strength_detail.html.",
        "",
        "## biometrics.json",
        "",
        "```text",
        "data:",
        "  lastMeasurements:",
        '    - measuredOn: "9999-99-99 99:99:99 +99:99"',
        "      value: numero 9.9",
        '      unitOfMeasure: "kg"',
        '      name: "Weight"',
        "```",
        "",
      ].join("\n"),
    );
    expect(stdout.mock.calls).toEqual([
      [`rapporto scritto: ${dest}`],
      ["sezioni: 3"],
    ]);
    // Dei file fuori elenco solo il numero, mai il nome.
    expect(stderr.mock.calls).toEqual([["file ignorati: 2"]]);
  });
});
