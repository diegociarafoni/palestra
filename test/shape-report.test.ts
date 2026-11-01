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
  HTML_ATTRIBUTES,
  main,
  maskText,
  readIdentities,
  shapeContext,
  shapeOfHtml,
  shapeOfJson,
  VOCAB,
} from "../scripts/shape-report";
import { ParseError } from "../src/errors";

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
    // Le forme diverse in ordine alfabetico, al massimo 5.
    expect(shapeOfJson([1, 2.5, "x", 3, [true], null, {}, false], ctx)).toEqual(
      [
        '- "a"',
        "- - booleano",
        "- booleano",
        "- null",
        "- numero 9",
        "… altre varianti",
      ],
    );
  });

  it("shape: table cells keep their column order", () => {
    // Le celle di una riga sono le colonne: ordine e numero sono struttura, non dati, e il
    // Task 0 Step 5 deve sapere in che ordine stanno le colonne della tabella delle serie.
    expect(
      shapeOfHtml(
        "<table><tr><th>Serie</th><th>Ripetizioni</th><th>Carico</th></tr><tr><td>1</td><td>12</td><td>Mario</td></tr></table>",
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    td",
      '      "99"',
      "    td",
      '      "99"',
      "    td",
      '      "A"',
      "  tr",
      "    th",
      '      "Serie"',
      "    th",
      '      "Ripetizioni"',
      "    th",
      '      "Carico"',
    ]);
  });

  it("shape: siblings show neither their order nor their number", () => {
    // Fratelli raggruppati per tag, nell'ordine della prima comparsa del tag; in un gruppo ogni
    // forma una volta, in ordine alfabetico, con `(ripetuto)` se compare più di una volta.
    expect(
      shapeOfHtml(
        "<div><span>12</span><b>Kg</b><span>Mario</span><span>60</span><span>5</span><b>Kg</b></div>",
        ctx,
      ),
    ).toEqual([
      "div",
      "  span (ripetuto)",
      '    "99"',
      "  span",
      '    "A"',
      "  b (ripetuto)",
      '    "Kg"',
    ]);
    expect(shapeOfHtml("<p>Kg<br>Km<br>Kg</p>", ctx)).toEqual([
      "p",
      '  "Kg" (ripetuto)',
      '  "Km"',
      "  br (ripetuto)",
    ]);
    expect(
      shapeOfHtml(
        "<div><i>Watt</i><i>Kg</i><i>Serie</i><i>Rpm</i><i>Bpm</i><i>Cal</i><i>Km</i></div>",
        ctx,
      ),
    ).toEqual([
      "div",
      "  i",
      '    "Bpm"',
      "  i",
      '    "Cal"',
      "  i",
      '    "Kg"',
      "  i",
      '    "Km"',
      "  i",
      '    "Rpm"',
      "  … altre varianti",
    ]);
    // Le voci con la chiave mascherata stanno dove compare la prima, con la stessa regola.
    expect(
      shapeOfJson(
        { "2026-10-30": 1, b: 1, "2026-10-31": "x", "2026-11-01": 2, c: 2 },
        ctx,
      ),
    ).toEqual([
      '«9999-99-99»: "a"',
      "«9999-99-99»: numero 9 (ripetuto)",
      "b: numero 9",
      "c: numero 9",
    ]);
    // Anche le forme degli elementi di una lista sono in ordine alfabetico.
    expect(shapeOfJson(["x", 1, null], ctx)).toEqual([
      '- "a"',
      "- null",
      "- numero 9",
    ]);
  });

  it("shape: masks data-like keys and identity keys", () => {
    // Le voci con la chiave mascherata stanno insieme, in ordine alfabetico; quelle uguali una
    // volta, con `(ripetuto)`. Due oggetti, perché oltre 5 forme scatta `… altre varianti`.
    expect(
      shapeOfJson(
        {
          "2026-10-29": { hr2: 120 },
          "2026-10-30": { hr2: 118 },
          "2026-10-31": "riposo",
          "123456": "x",
          hr2: 5,
        },
        ctx,
      ),
    ).toEqual([
      "«9999-99-99»: (ripetuto)",
      "  hr9: numero 9",
      '«9999-99-99»: "a"',
      '«999999»: "a"',
      "hr9: numero 9",
    ]);
    expect(
      shapeOfJson(
        {
          u123456: "x",
          // Un id esadecimale può non avere 3 cifre di fila: contano le cifre in tutto.
          ab1c2d3e4f: "x",
          Rossi: 1,
          marioRossi: 2,
          "user name": 3,
          hr2: 5,
        },
        ctx,
      ),
    ).toEqual([
      "«A»: numero 9",
      "«a a»: numero 9",
      '«a999999»: "a"',
      '«a99a99a99a99a»: "a"',
      "«a»: numero 9",
      "hr9: numero 9",
    ]);
  });

  it("shape: printed names carry no digits or dates", () => {
    // Ogni cifra di un nome diventa `9`; un nome con una parte che è un mese o un giorno, anche
    // abbreviato, si maschera.
    expect(
      shapeOfJson({ hr2: 1, Oct29: 2, wed: "x", ott: true, dayWed: 5 }, ctx),
    ).toEqual([
      "hr9: numero 9",
      "«A99»: numero 9",
      '«a»: "a"',
      "«a»: booleano",
      "«a»: numero 9",
    ]);
    expect(shapeOfJson({ property: "Hr2Max" }, ctx)).toEqual([
      'property: "Hr9Max"',
    ]);
    expect(shapeOfJson({ property: "MonRpm" }, ctx)).toEqual(['property: "A"']);
    // Le classi si giudicano una per una.
    expect(
      shapeOfHtml(
        '<div class="fc-day fc-day-wed col-md-6 h2o" name="hr2" id="Oct29"></div>',
        ctx,
      ),
    ).toEqual(["div[class=fc-day «a-a-a» col-md-9 h9o, name=hr9, id=«A99»]"]);
    expect(shapeOfHtml("<h2>Serie</h2>", ctx)).toEqual(["h9", '  "Serie"']);
  });

  it("shape: only known attribute names are printed", () => {
    // Un valore senza virgolette fa nascere attributi dal testo ("Rossi", "Mantova"); `checked` e
    // `selected` dicono che cosa ha scelto l'utente e non compaiono mai.
    expect(
      shapeOfHtml(
        '<input value=Mario Rossi title=Via Mantova data-row2="x" data-mario="x" aria-label="x" foo="x" TYPE=hidden hidden checked selected required class>',
        ctx,
      ),
    ).toEqual([
      "input[value=«A», «A», title=«A», «A», data-row9=«a», «a-a»=«a», aria-label=«a», «a»=«a», type=hidden, hidden, required, «a»]",
    ]);
    // Ogni nome dell'elenco esce in chiaro: l'elenco è fisso.
    expect([...HTML_ATTRIBUTES].join(" ")).toBe(
      "id class name type value href src action method for role rel title alt lang dir style width height colspan rowspan scope placeholder target content charset http-equiv property itemprop tabindex autocomplete maxlength minlength min max step pattern accept enctype form label nonce integrity crossorigin referrerpolicy media sizes srcset loading async defer hidden disabled readonly required multiple open novalidate autofocus onclick onchange onsubmit onload onerror",
    );
  });

  it("shape: names glued to the user's name are masked", () => {
    // Le parole vengono solo dai nomi e dalla parte locale dell'e-mail: "user" in un URL non
    // maschera `userId`.
    const glued = shapeContext([
      ...IDENTITIES,
      "Mario Rossi",
      "https://example.com/user/photo.jpg",
    ]);
    expect(
      shapeOfHtml(
        '<div id="mariorossi" name="MRossi" for="user_mrossi" role="ROSSIM" class="initials-MR" type="userId"></div>',
        glued,
      ),
    ).toEqual([
      "div[id=«a», name=«A», for=«a_a», role=«A», class=«a-A», type=userId]",
    ]);
    expect(shapeOfJson({ userId: 1, user_mrossi: 2 }, glued)).toEqual([
      "userId: numero 9",
      "«a_a»: numero 9",
    ]);
    // Il probe raccoglie nome e cognome anche in campi separati: le iniziali vengono anche dalle
    // coppie di identità di una parola sola (qui solo "Mario" e "Rossi", in `ctx`).
    expect(
      shapeOfHtml('<span class="initials-MR"></span><b class="RM"></b>', ctx),
    ).toEqual(["span[class=«a-A»]", "b[class=«A»]"]);
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
      '- physicalProperty: "A"',
      '- physicalProperty: "HDistance"',
      '  name: "A"',
      "  rawValue: numero 9.9",
      '- property: "A A"',
      '- property: "AvgRpm"',
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
      // Le righe in ordine alfabetico e senza numero; le celle di una riga nell'ordine delle colonne.
      "    table[class=sets]",
      "      tr (ripetuto)",
      "        td",
      '          "99"',
      "        td",
      '          "99"',
      "        td",
      '          "99"',
      "      tr",
      "        th",
      '          "Serie"',
      "        th",
      '          "Ripetizioni"',
      "        th",
      '          "Carico"',
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

  it("shape: only known symbols are kept", () => {
    // Punteggiatura e simboli ASCII e pochi segni tipografici; l'accento grave diventa `'`.
    expect(maskText("!\"#$%&'()*+,-./:;<=>?@[\\]^_{|}~", VOCAB)).toBe(
      "!\"#$%&'()*+,-./:;<=>?@[\\]^_{|}~",
    );
    // NFKC scrive `…` come tre punti.
    expect(maskText("«»–—€°·’‘“”…", VOCAB)).toBe("«»–—€°·’‘“”...");
    expect(maskText("a`b", VOCAB)).toBe("a'a");
    // Ogni altro carattere che non è lettera, cifra o spazio diventa `?`.
    expect(maskText("Kg ✓ 😀 × § \uE000 \uD800", VOCAB)).toBe("Kg ? ? ? ? ? ?");
  });

  it("shape: depth is capped at 40", () => {
    const json = JSON.parse(`${"[".repeat(45)}1${"]".repeat(45)}`);
    expect(shapeOfJson(json, ctx)).toEqual([
      `${"- ".repeat(40)}(troppo profondo)`,
    ]);
    const html = `${"<div>".repeat(45)}x${"</div>".repeat(45)}`;
    expect(shapeOfHtml(html, ctx)).toEqual([
      ...Array.from({ length: 40 }, (_, depth) => `${"  ".repeat(depth)}div`),
      `${"  ".repeat(40)}(troppo profondo)`,
    ]);
  });

  it("shape: letters without a decomposition are folded too", () => {
    const lines = [
      "Łukasz",
      "Søren",
      "Strauß",
      "Yıldız",
      "Đorđe",
      "Ævar",
      "Œuvre",
      "Þór",
    ];
    expect(
      checkReport(lines, [
        "Lukasz",
        "Soren",
        "Strauss",
        "Yildiz",
        "Dorde",
        "Aevar",
        "Oeuvre",
        "Thor",
      ]),
    ).toEqual([
      { line: 1, kind: "identity" },
      { line: 2, kind: "identity" },
      { line: 3, kind: "identity" },
      { line: 4, kind: "identity" },
      { line: 5, kind: "identity" },
      { line: 6, kind: "identity" },
      { line: 7, kind: "identity" },
      { line: 8, kind: "identity" },
    ]);
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
    // Il controllo vede la sezione com'è scritta, titolo compreso: riga 5.
    expect(stderr.mock.calls).toEqual([["login_ok.html:5: identity"]]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("shape: an invalid identities.json gives a ParseError without cause", async () => {
    // La causa (l'errore di JSON.parse o di zod) potrebbe citare le identità del file.
    const src = join(dir, "probe_out");
    mkdirSync(src);
    writeFileSync(join(src, "identities.json"), '["Mario", 1]');
    const error = await readIdentities(src).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParseError);
    expect(error instanceof ParseError && error.message).toBe(
      "identities.json non valido: serve un array di stringhe",
    );
    expect(error instanceof ParseError && error.cause).toBeUndefined();
  });

  it("shape: invalid JSON is named, never shown", async () => {
    expect(
      shapeOfHtml(
        "<script>EU.currentUser = JSON.parse('{rotto');</script>",
        ctx,
      ),
    ).toEqual(["script", "  EU.currentUser:", "    (JSON non valido)"]);
    const src = probeOut({ "session_strength.json": "{rotto" });
    const dest = join(dir, "forma.md");
    expect(await main([src, dest])).toBe(0);
    expect(readFileSync(dest, "utf8")).toContain(
      [
        "## session_strength.json",
        "",
        "```text",
        "(JSON non valido)",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("shape: unexpected errors print only a fixed message", async () => {
    const src = probeOut({ "login_ok.html": "<p>Kg</p>" });
    const dest = join(dir, "forma.md");
    // Una cartella al posto di un file del probe: readFile fallisce con EISDIR.
    mkdirSync(join(src, "strength_detail.html"));
    expect(await main([src, dest])).toBe(70);
    expect(stderr.mock.calls).toEqual([["errore imprevisto: EISDIR"]]);
    expect(existsSync(dest)).toBe(false);
    stderr.mockClear();
    // Una destinazione in una cartella che non esiste.
    rmSync(join(src, "strength_detail.html"), { recursive: true });
    expect(await main([src, join(dir, "manca", "forma.md")])).toBe(70);
    expect(stderr.mock.calls).toEqual([["errore imprevisto: ENOENT"]]);
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
      "strength_detail_3.html": "<p>Nessuna serie</p>",
      "last_sessions_2.html": "<p>Kg</p>",
      // Fuori elenco: la seduta grezza e una seconda serie cardio.
      "session_1.json": '{"data":{}}',
      "cardio_timeseries_2.json": "{}",
    });
    expect(await main([src, dest])).toBe(0);
    // Una sezione per famiglia, con un titolo fisso; le forme diverse dei suoi file una volta,
    // in ordine alfabetico: né quanti file né quali.
    expect(readFileSync(dest, "utf8")).toBe(
      [
        "# Forma dei dati di Mywellness",
        "",
        "File generato da `scripts/shape-report.ts` (Task 0) con le risposte del probe, che restano sul computer dell'utente. Mostra solo la forma dei dati, con una sezione per famiglia di file e, in ogni sezione, le forme diverse dei suoi file in ordine alfabetico:",
        "",
        "- restano scritti i nomi dei campi JSON, dei tag e degli attributi HTML noti e i valori di attributi come `class`, `id` e `name` e dei campi `physicalProperty` e `property`, se hanno la forma di un nome, con ogni cifra resa `9`; gli altri sono mascherati tra `«»`;",
        "- nei valori ogni parola diventa `a` (se comincia con una minuscola) o `A` (se comincia con una maiuscola); una sequenza di 1 o 2 cifre diventa `99`, una più lunga ha un `9` per cifra (al massimo 20, poi `…`); i numeri JSON diventano `numero 9`, `numero 9.9` o `numero -9`;",
        "- restano scritte solo le parole del vocabolario `VOCAB` dello script (unità di misura, parole della tabella delle serie e dell'interfaccia, tipi di esercizio), la punteggiatura e i simboli ASCII, pochi segni tipografici e la `T` e la `Z` delle date ISO; ogni altro carattere diventa `?`;",
        "- elementi fratelli con lo stesso tag, voci con la chiave mascherata ed elementi di una lista compaiono una volta per forma, in ordine alfabetico e al massimo 5 (poi `… altre varianti`), senza dire quanti sono; le celle di una riga di tabella restano tutte, nell'ordine delle colonne; `(ripetuto)` segna un fratello o una voce che si ripete; il contenuto degli script è omesso, tranne la forma di `EU.currentUser`.",
        "",
        "Dell'ordine della pagina resta solo l'ordine in cui compaiono per la prima volta i tag diversi tra fratelli. Nient'altro: nessun nome, data, numero o identificativo.",
        "",
        "## last_sessions*.html",
        "",
        "```text",
        "p",
        '  "Kg"',
        "```",
        "",
        "## strength_detail*.html",
        "",
        "```text",
        "p",
        '  "A serie"',
        "```",
        "",
        "```text",
        "table[class=sets]",
        "  tr",
        "    td",
        '      "99"',
        "    td",
        '      "99"',
        "  tr",
        "    th",
        '      "Serie"',
        "    th",
        '      "Kg"',
        "```",
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
    // Su stdout solo la destinazione; dei file fuori elenco nemmeno il numero.
    expect(stdout.mock.calls).toEqual([[`rapporto scritto: ${dest}`]]);
    expect(stderr).not.toHaveBeenCalled();
  });
});
