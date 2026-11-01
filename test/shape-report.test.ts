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
  DATE_PARTS,
  DATE_WORDS,
  FIXED_TEXT,
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

  it("shape: no date part in any language prints", () => {
    // Mesi e giorni in italiano, inglese, tedesco, francese e spagnolo, interi e abbreviati, le
    // parole relative (oggi, weekend), i momenti del giorno e le forme di 2 lettere dei giorni.
    expect(DATE_PARTS.join(" ")).toBe(
      "abr abril afternoon ago agosto am aout apr april aprile aug august avr avril dec december decembre dez dezember di dic dicembre diciembre dienstag dim dimanche do dom domani domenica domingo donnerstag ene enero evening feb febbraio febrero februar february fevr fevrier fr freitag fri friday gen gennaio gi gio giovedi giu giugno ieri jan januar january janv janvier jeu jeudi jueves juil juillet juin jul juli julio july jun june juni junio lu lug luglio lun lundi lunedi lunes ma mag maggio mai mar march mardi mars martedi martes marz marzo mattina may mayo me mer mercoledi mercredi mi miercoles mittwoch mo mon monday montag morning mrz night notte nov november novembre noviembre oct october octobre octubre oggi okt oktober ott ottobre pm pomeriggio sa sab sabado sabato sam samedi samstag sat saturday sep sept september septembre septiembre sera set sett settembre so sonntag su sun sunday th thu thur thurs thursday today tomorrow tu tue tues tuesday ve ven vendredi venerdi viernes we wed wednesday weekend yesterday",
    );
    expect(VOCAB.filter((word) => DATE_PARTS.includes(word))).toEqual([]);
    expect(
      shapeOfJson(
        { montagLoad: 1, oggi: "x", sera: true, amCount: null, toDo: [] },
        ctx,
      ),
    ).toEqual([
      '«a»: "a"',
      "«a»: []",
      "«a»: booleano",
      "«a»: null",
      "«a»: numero 9",
    ]);
    // I tag sono esclusi: `th` resta, anche se è "giovedì" abbreviato.
    expect(shapeOfHtml("<p><th>Kg</th></p>", ctx)).toEqual([
      "p",
      "  th",
      '    "Kg"',
    ]);
    // Il controllo finale le trova tra confini di lettera, tranne le forme di 2 lettere dei
    // giorni (`th` è un tag)...
    expect(
      checkReport(
        ["a montag a", "Oggi", "mercredi", "a pm a", "th", "a so a"],
        [],
      ),
    ).toEqual([
      { line: 1, kind: "date" },
      { line: 2, kind: "date" },
      { line: 3, kind: "date" },
      { line: 4, kind: "date" },
    ]);
    // ...e nessuna compare nel testo che il rapporto scrive da sé.
    expect(checkReport(FIXED_TEXT, [])).toEqual([]);
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

  it("shape: a header row keeps its column order", () => {
    // Il Task 0 Step 5 deve sapere in che ordine stanno le colonne della tabella delle serie:
    // solo una riga di `th` con testi diversi di VOCAB resta nell'ordine della pagina, al
    // massimo 12 colonne. Le righe di dati si raggruppano come gli altri fratelli.
    expect(
      shapeOfHtml(
        "<table><tr><th>Serie</th><th><span>Ripetizioni</span> eseguite</th><th>Carico</th></tr><tr><td>1</td><td>12</td><td>Mario</td></tr></table>",
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    td (ripetuto)",
      '      "99"',
      "    td",
      '      "A"',
      "  tr",
      "    th",
      '      "Serie"',
      "    th",
      '      "Ripetizioni eseguite"',
      "    th",
      '      "Carico"',
    ]);
    // Di una cella d'intestazione restano solo `th` e il testo: né attributi né elementi, che
    // nell'ordine delle colonne direbbero quale colonna è segnata.
    expect(
      shapeOfHtml(
        '<table><tr><th class="d">Serie</th><th class="d done">Rip<span class="dot"></span></th><th class="d">Kg</th></tr></table>',
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    th",
      '      "Serie"',
      "    th",
      '      "Rip"',
      "    th",
      '      "Kg"',
    ]);
    // Senza una parola delle serie (`serie`, `sets`) la riga non è la tabella delle serie: si
    // raggruppa, anche se fatta di parole di VOCAB come una striscia della settimana.
    expect(
      shapeOfHtml(
        "<table><tr><th>Durata</th><th>Calorie</th><th>Move</th></tr><tr><th>cardio</th><th>cardio done</th><th>forza</th><th>forza done</th></tr></table>",
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    th",
      '      "Calorie"',
      "    th",
      '      "Durata"',
      "    th",
      '      "Move"',
      "  tr",
      "    th",
      '      "cardio done"',
      "    th",
      '      "cardio"',
      "    th",
      '      "forza done"',
      "    th",
      '      "forza"',
    ]);
    const words = ["Serie", "Kg", "Rip", "Reps", "Durata", "Calorie", "Tempo"];
    const more = ["Distanza", "Potenza", "Rpm", "Watt", "Livello", "Peso"];
    const header = [...words, ...more].map((word) => `<th>${word}</th>`);
    expect(
      shapeOfHtml(
        `<table><thead><tr>${header.join("")}</tr></thead></table>`,
        ctx,
      ),
    ).toEqual([
      "table",
      "  thead",
      "    tr",
      ...[...words, ...more.slice(0, 5)].flatMap((word) => [
        "      th",
        `        "${word}"`,
      ]),
      "      … altre colonne",
    ]);
  });

  it("shape: only a header row keeps its order", () => {
    // Una settimana fatta a tabella con il martedì e il giovedì segnati: in ogni caso le sue
    // celle si raggruppano e non si legge quali giorni sono segnati.
    const week =
      '<tr><td class="day">1</td><td class="day done">2</td><td class="day">3</td><td class="day done">4</td><td class="day">5</td><td class="day">6</td><td class="day">7</td></tr>';
    const popover = week.replaceAll(
      'done">',
      'done"><table><tr><th>Serie</th><th>Kg</th></tr></table>',
    );
    const days = (html: string) =>
      shapeOfHtml(html, ctx)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("td[class=«a"));
    const cases = [
      `<table>${week}</table>`,
      `<table><tr><th colspan="7">Serie di allenamenti</th></tr>${week}</table>`,
      `<table>${popover}</table>`,
      `<table><tr><th>Inserisci</th></tr>${week}</table>`,
      `<table><template><th>Series</th></template>${week}</table>`,
      `<table><tr><th><script>chart({series:[]})</script></th></tr>${week}</table>`,
      `<table><tr><td><table><tr><th>Serie</th><th>Kg</th></tr></table></td></tr>${week}</table>`,
      `<table><tr><th>Serie</th><th>Kg</th></tr><tr><td><div>${week}</div></td></tr></table>`,
      `<table><tr><th style="display:none">seri</th></tr>${week}</table>`,
    ];
    for (const html of cases) {
      expect(days(html)).toEqual([
        "td[class=«a done»] (ripetuto)",
        "td[class=«a»] (ripetuto)",
      ]);
    }
    // Intestazioni con cifre, giorni o parole ripetute: anche queste si raggruppano, e non si
    // legge il numero di serie di una tabella trasposta.
    expect(
      shapeOfHtml(
        "<table><tr><th>Serie</th><th>1</th><th>2</th><th>3</th><th>4</th></tr></table>",
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    th (ripetuto)",
      '      "99"',
      "    th",
      '      "Serie"',
    ]);
    expect(
      shapeOfHtml(
        "<table><tr><th>Lun</th><th>Mar</th><th>Mer</th></tr><tr><th>Cardio</th><th>Forza</th><th>Cardio</th></tr></table>",
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    th (ripetuto)",
      '      "A"',
      "  tr",
      "    th (ripetuto)",
      '      "Cardio"',
      "    th",
      '      "Forza"',
    ]);
  });

  it("shape: header texts must differ in their words", () => {
    // Punteggiatura e parole ripetute non bastano a rendere diversi due testi: la riga si
    // raggruppa.
    expect(
      shapeOfHtml(
        "<table><tr><th>move</th><th>Serie</th><th>done.</th><th>move move</th><th>done</th></tr></table>",
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    th",
      '      "Serie"',
      "    th",
      '      "done"',
      "    th",
      '      "done."',
      "    th",
      '      "move move"',
      "    th",
      '      "move"',
    ]);
    // Né l'ordine delle parole.
    expect(
      shapeOfHtml(
        "<table><tr><th>Serie</th><th>Kg eseguiti</th><th>eseguiti Kg</th></tr></table>",
        ctx,
      ),
    ).toEqual([
      "table",
      "  tr",
      "    th",
      '      "Kg eseguiti"',
      "    th",
      '      "Serie"',
      "    th",
      '      "eseguiti Kg"',
    ]);
  });

  it("shape: deeply nested tables do not stop the report", () => {
    const html = `${"<table><tr><td>".repeat(10000)}x${"</td></tr></table>".repeat(10000)}`;
    const lines = shapeOfHtml(html, ctx);
    expect(lines.length).toBe(41);
    expect(lines.at(-1)).toBe(`${"  ".repeat(40)}(troppo profondo)`);
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
      "  hr99: numero 9",
      '«9999-99-99»: "a"',
      '«999999»: "a"',
      "hr99: numero 9",
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
      "hr99: numero 9",
    ]);
  });

  it("shape: printed names carry no digits or dates", () => {
    // Ogni sequenza di cifre di un nome diventa `99`; un nome con una parte che è un mese o un giorno, anche
    // abbreviato, si maschera.
    expect(
      shapeOfJson({ hr2: 1, Oct29: 2, wed: "x", ott: true, dayWed: 5 }, ctx),
    ).toEqual([
      "hr99: numero 9",
      "«A99»: numero 9",
      '«a»: "a"',
      "«a»: booleano",
      "«a»: numero 9",
    ]);
    expect(shapeOfJson({ property: "Hr2Max" }, ctx)).toEqual([
      'property: "Hr99Max"',
    ]);
    expect(shapeOfJson({ property: "MonRpm" }, ctx)).toEqual(['property: "A"']);
    // Anche nei valori di `name`, `type` e `method`.
    expect(
      shapeOfHtml(
        '<div name="fc-day-wed" type="hr2" method="Oct29"></div>',
        ctx,
      ),
    ).toEqual(["div[name=«a-a-a», type=hr99, method=«A99»]"]);
    // Nei tag solo il livello dei titoli resta scritto.
    expect(shapeOfHtml("<h2>Serie</h2><x-row12></x-row12>", ctx)).toEqual([
      "h2",
      '  "Serie"',
      "x-row99",
    ]);
  });

  it("shape: digit runs in names become 99", () => {
    // Come nei valori: una o due cifre danno `99`, così `week-12` e `sessions-3` si somigliano.
    expect(
      shapeOfHtml('<input name="week-12" type="sessions-3">', ctx),
    ).toEqual(["input[name=week-99, type=sessions-99]"]);
    expect(shapeOfJson({ hr2: 1 }, ctx)).toEqual(["hr99: numero 9"]);
  });

  it("shape: random-looking names are masked", () => {
    // Almeno 4 parti di 1 o 2 lettere: un token, non un nome; `hdSessionIdCR` ne ha 3.
    expect(shapeOfJson({ AbCdEfGh9j: 1, hdSessionIdCR: 2 }, ctx)).toEqual([
      "«A99a»: numero 9",
      "hdSessionIdCR: numero 9",
    ]);
    // Un token con 1 o 2 cifre resta un'identità anche scritto con i 9.
    expect(
      checkReport(
        ["Xy99Kq99: numero 9", "ab99cd: numero 9"],
        ["Xy7Kq2", "ab12cd"],
      ),
    ).toEqual([
      { line: 1, kind: "identity" },
      { line: 2, kind: "identity" },
    ]);
  });

  it("shape: identities without words do not block the report", () => {
    // Data di nascita, telefono e ultimo accesso scritti con i 9 sono la forma di ogni data e
    // di ogni numero del rapporto, non un'identità: solo le identità con parole hanno i 9.
    expect(
      checkReport(
        [
          'birthDate: "99/99/9999"',
          'phone: "+99 999 9999999"',
          'lastLogin: "9999-99-99T99:99:99Z"',
        ],
        ["12/04/1985", "+39 333 1234567", "2026-11-01T10:00:00Z"],
      ),
    ).toEqual([]);
    // Neanche un'identità le cui lettere sono parole di VOCAB, come un peso.
    expect(checkReport(['weight: "99 kg"'], ["75 kg"])).toEqual([]);
    // Un codice breve scritto con i 9 vale solo tra confini di lettere e cifre: `level99` non è
    // `L3`.
    expect(
      checkReport(
        [
          "input[name=level99]",
          "tab-99: numero 9",
          '"999bpm"',
          '"99km"',
          "field99: numero 9",
        ],
        ["L3", "B-7", "3B", "12K", "D4"],
      ),
    ).toEqual([]);
    // Un'identità con i caratteri delle espressioni regolari non rompe il controllo.
    expect(
      checkReport(["x99"], [String.raw`x1(b)[c]{d}.e*f+g?h^i$j|k\l-m/n`]),
    ).toEqual([]);
    // Un codice con lettere sole, come una tessera, resta un'identità scritto con i 9.
    expect(
      checkReport(["A99B99: numero 9", "input[name=B-99]"], ["A1B2", "B-7"]),
    ).toEqual([
      { line: 1, kind: "identity" },
      { line: 2, kind: "identity" },
    ]);
    // Scritte come sono, restano identità.
    expect(checkReport(['born: "12/04/1985"'], ["12/04/1985"])).toEqual([
      { line: 1, kind: "identity" },
      { line: 1, kind: "number" },
    ]);
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
      "input[value=«A», «A», title=«A», «A», data-row99=«a», «a-a»=«a», aria-label=«a», «a»=«a», type=hidden, hidden, required, «a»]",
    ]);
    // Ogni nome dell'elenco esce in chiaro: l'elenco è fisso.
    expect([...HTML_ATTRIBUTES].join(" ")).toBe(
      "id class name type value href src action method for role rel title alt lang dir style width height colspan rowspan scope placeholder target content charset http-equiv property itemprop tabindex autocomplete maxlength minlength min max step pattern accept enctype form label nonce integrity crossorigin referrerpolicy media sizes srcset loading async defer hidden disabled readonly required multiple open novalidate autofocus onclick onchange onsubmit onload onerror",
    );
  });

  it("shape: only name, type and method values are printed", () => {
    // Nessun parser legge class, id, for, role o rel: i loro valori sono mascherati.
    expect(
      shapeOfHtml(
        '<span class="gender-male goal-weightloss" id="box" role="note" for="x" rel="nofollow" name="hdSessionIdCR" type="hidden" method="post"></span>',
        ctx,
      ),
    ).toEqual([
      "span[class=«a-a a-a», id=«a», role=«a», for=«a», rel=«a», name=hdSessionIdCR, type=hidden, method=post]",
    ]);
    // Con `\"` o `\'` nel testo degli attributi il parser li spezza male (`name=Giulia` nasce
    // dal valore di `title`): tutti i valori sono mascherati.
    expect(
      shapeOfHtml(String.raw`<div title="a\" name=Giulia \"">`, ctx),
    ).toEqual(["div[title=«a\\», name=«A»]"]);
  });

  it("shape: field names may start with an underscore", () => {
    // Il nome del campo anti-CSRF serve a ricostruire il login (issue #52).
    expect(
      shapeOfHtml(
        '<input type="hidden" name="__RequestVerificationToken" value="x">',
        ctx,
      ),
    ).toEqual([
      "input[type=hidden, name=__RequestVerificationToken, value=«a»]",
    ]);
  });

  it("shape: tags are exempt only from the two-letter days", () => {
    // `th` e `do-list` restano; `mon-picker` si maschera, così il controllo finale non blocca.
    const lines = shapeOfHtml(
      "<mon-picker></mon-picker><do-list></do-list>",
      ctx,
    );
    expect(lines).toEqual(["«a-a»", "do-list"]);
    expect(checkReport(lines, IDENTITIES)).toEqual([]);
  });

  it("shape: long names with digits are masked", () => {
    // Da 12 caratteri un nome con cifre è più probabilmente un token che un nome di campo.
    expect(
      shapeOfHtml('<input name="xkqzvbnmwplrtyhgf7ds" type="hidden">', ctx),
    ).toEqual(["input[name=«a99a», type=hidden]"]);
    expect(shapeOfJson({ abcdefghijk1: 1, heartRate2: 2 }, ctx)).toEqual([
      "«a99»: numero 9",
      "heartRate99: numero 9",
    ]);
  });

  it("shape: unreadable attributes do not stop the report", () => {
    // Il parser non sa leggere attributi con il nome di un metodo di Object.
    expect(
      shapeOfHtml(
        "<div toString=1><p>Kg</p></div><b constructor=1></b><i valueOf=1></i><u hasOwnProperty=1></u>",
        ctx,
      ),
    ).toEqual([
      "div[«attributi non leggibili»]",
      "  p",
      '    "Kg"',
      "b[«attributi non leggibili»]",
      "i[«attributi non leggibili»]",
      "u[«attributi non leggibili»]",
    ]);
  });

  it("shape: names glued to the user's name are masked", () => {
    // Le parole vengono solo dai nomi e dalla parte locale dell'e-mail: "user" in un URL non
    // maschera `userId`.
    const glued = shapeContext([
      ...IDENTITIES,
      "Mario Rossi",
      "https://example.com/user/photo.jpg",
    ]);
    // Nelle chiavi JSON, che si stampano se passano la regola dei nomi.
    expect(
      shapeOfJson(
        {
          userId: 1,
          mariorossi: 2,
          MRossi: 3,
          user_mrossi: 4,
          ROSSIM: 5,
          initials_MR: 6,
        },
        glued,
      ),
    ).toEqual([
      "userId: numero 9",
      "«A»: numero 9 (ripetuto)",
      "«a_A»: numero 9",
      "«a_a»: numero 9",
      "«a»: numero 9",
    ]);
    // E nei valori di `name`, `type` e `method`.
    expect(
      shapeOfHtml('<div name="MRossi" type="userId"></div>', glued),
    ).toEqual(["div[name=«A», type=userId]"]);
  });

  it("shape: the fixed lines of the report never block it", () => {
    // Un valore con spazi raccolto dal profilo ("Strength 2026") dà la parola `strength`, che
    // sta anche nel titolo fisso di una sezione: il titolo non può contenere dati.
    expect(
      checkReport(
        ["## session_strength.json", "", "```text", "a: numero 9", "```"],
        ["Strength 2026"],
      ),
    ).toEqual([]);
    expect(checkReport(['a: "strength"'], ["Strength 2026"])).toEqual([
      { line: 1, kind: "identity" },
    ]);
  });

  it("shape: words of an address are identity words", () => {
    // Un'identità con spazi e cifre (un indirizzo) dà le sue parole, tranne via, corso e simili.
    const address = shapeContext(["Via Garibaldi 5"]);
    expect(
      shapeOfJson(
        { garibaldi: 1, viaCount: 2, property: "ViaGaribaldi" },
        address,
      ),
    ).toEqual(["«a»: numero 9", "viaCount: numero 9", 'property: "A"']);
    expect(checkReport(["garibaldi: numero 9"], ["Via Garibaldi 5"])).toEqual([
      { line: 1, kind: "identity" },
    ]);
  });

  it("shape: names with six consonants in a row are masked", () => {
    // Lettere a caso, non un nome; `XMLHttpRequest`, `XSRFTOKEN` e `lengths` ne hanno al
    // massimo 5 di fila in una parte.
    expect(
      shapeOfHtml(
        '<input name="_xkqzvbnmwplrtyhgfds" type="XMLHttpRequest">',
        ctx,
      ),
    ).toEqual(["input[name=«_a», type=XMLHttpRequest]"]);
    expect(
      shapeOfJson(
        { XSRFTOKEN: 1, HTTPSRedirect: 2, lengths: 3, lengthcm: 4 },
        ctx,
      ),
    ).toEqual([
      "XSRFTOKEN: numero 9",
      "HTTPSRedirect: numero 9",
      "lengths: numero 9",
      "«a»: numero 9",
    ]);
  });

  it("shape: names glued to a 3-letter name are masked", () => {
    expect(
      shapeOfJson({ profileeva: 1, evabadge: "x" }, shapeContext(["Eva"])),
    ).toEqual(['«a»: "a"', "«a»: numero 9"]);
  });

  it("shape: initials in any case and order are masked", () => {
    // Il probe raccoglie nome e cognome anche in campi separati: le iniziali vengono dai nomi
    // interi ("Giulia Bianchi") e dalle coppie di nomi di una parola ("Mario", "Rossi"), in
    // entrambi gli ordini e senza distinguere maiuscole e minuscole.
    const names = shapeContext([...IDENTITIES, "Giulia Bianchi"]);
    expect(
      shapeOfJson({ mr: 1, Mr: "x", RM: true, bg: null, Gb: [] }, names),
    ).toEqual([
      '«A»: "a"',
      "«A»: []",
      "«A»: booleano",
      "«a»: null",
      "«a»: numero 9",
    ]);
    // Anche quando le iniziali sono parti di una lettera, unite.
    expect(
      shapeOfHtml('<input name="M.R" type="m-r" method="x_M_R">', names),
    ).toEqual(["input[name=«A.A», type=«a-a», method=«a_A_A»]"]);
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
    // Resta scritto solo se ogni parte è di VOCAB o di PROPERTY_WORDS: non il nome di un'altra
    // persona, una categoria del profilo o lettere a caso.
    expect(
      shapeOfJson(
        [
          { property: "Giulia" },
          { property: "LuigiVerdi" },
          { property: "MaleAdult" },
          { property: "XkqZvbNmw" },
        ],
        ctx,
      ),
    ).toEqual(['- property: "A"']);
    expect(
      shapeOfJson(
        [
          { physicalProperty: "Duration" },
          { property: "FatMass" },
          { physicalProperty: "TotalIsoWeight" },
          { property: "MetabolicAge" },
        ],
        ctx,
      ),
    ).toEqual([
      '- physicalProperty: "Duration"',
      '- physicalProperty: "TotalIsoWeight"',
      '- property: "FatMass"',
      '- property: "MetabolicAge"',
    ]);
    expect(
      shapeOfJson(
        [
          { property: "Vo2Max" },
          { property: "BasalMetabolicRate" },
          { property: "TimeUnderTension" },
          { property: "RangeOfMotion" },
          { property: "Torque" },
        ],
        ctx,
      ),
    ).toEqual([
      '- property: "BasalMetabolicRate"',
      '- property: "RangeOfMotion"',
      '- property: "TimeUnderTension"',
      '- property: "Torque"',
      '- property: "Vo99Max"',
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
      "    a[class=«a-a», href=«/a/A/99a99a99a99a-99a99a-99a99a-99a99a-99a99a99a99a99a99a»]",
      '      "A A"',
      // Righe e celle di dati in ordine alfabetico e senza numero; la riga di `th` nell'ordine delle colonne.
      "    table[class=«sets»]",
      "      tr (ripetuto)",
      "        td (ripetuto)",
      '          "99"',
      "      tr",
      "        th",
      '          "Serie"',
      "        th",
      '          "Ripetizioni"',
      "        th",
      '          "Carico"',
      "    input[type=hidden, name=hdSessionIdCR, value=«9999»]",
      "    div[id=«a-a», data-user=«A», role=«a», hidden]",
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
        "- restano scritti i nomi dei campi JSON, dei tag e degli attributi HTML noti e, degli attributi, solo i valori di `name`, `type` e `method`, oltre ai valori dei campi `physicalProperty` e `property` le cui parti in camelCase sono tutte parole del vocabolario o di un elenco fisso di parole delle grandezze, se hanno la forma di un nome, con ogni sequenza di cifre resa `99` (non nei titoli `h1`…`h6`); un nome è mascherato tra `«»`, come ogni altro valore, se ha 3 o più cifre, almeno 12 caratteri e una cifra, 5 consonanti di fila, 4 o più parti di 1 o 2 lettere, una parte che è un mese, un giorno o un momento del giorno (in italiano, inglese, tedesco, francese o spagnolo), le iniziali dell'utente o una parola delle sue identità; in un elemento con `\\\"` o `\\'` negli attributi tutti i valori sono mascherati;",
        "- nei valori ogni parola diventa `a` (se comincia con una minuscola) o `A` (se comincia con una maiuscola); una sequenza di 1 o 2 cifre diventa `99`, una più lunga ha un `9` per cifra (al massimo 20, poi `…`); i numeri JSON diventano `numero 9`, `numero 9.9` o `numero -9`;",
        "- restano scritte solo le parole del vocabolario `VOCAB` dello script (unità di misura, parole della tabella delle serie e dell'interfaccia, tipi di esercizio), la punteggiatura e i simboli ASCII, pochi segni tipografici e la `T` e la `Z` delle date ISO; ogni altro carattere diventa `?`;",
        "- elementi fratelli con lo stesso tag (anche le celle di una riga di tabella), voci con la chiave mascherata ed elementi di una lista compaiono una volta per forma, in ordine alfabetico e al massimo 5 (poi `… altre varianti`), senza dire quanti sono; solo in una riga d'intestazione, fatta di almeno 2 celle `th` con testi diversi, senza cifre e di sole parole del vocabolario, le celle restano nell'ordine delle colonne, al massimo 12 (poi `… altre colonne`), e di ognuna compaiono solo `th` e il testo; `(ripetuto)` segna un fratello o una voce che si ripete; anche le forme di una sezione sono al massimo 5 (poi `… altre varianti`); il contenuto degli script è omesso, tranne la forma di `EU.currentUser`; un elemento con attributi che il parser non sa leggere compare con `«attributi non leggibili»`.",
        "",
        "Dell'ordine della pagina restano solo l'ordine in cui compaiono per la prima volta i tag diversi tra fratelli e l'ordine delle colonne delle righe d'intestazione. Nient'altro: nessun nome, data, numero o identificativo.",
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
        "table[class=«sets»]",
        "  tr",
        "    td (ripetuto)",
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

  it("cli: a header row with words outside VOCAB is reported", async () => {
    // Senza ordine delle colonne lo Step 5 non sa dove stanno serie e kg: una nota fissa su
    // stderr dice di tenere probe_out/. Una riga di giorni, senza parole di VOCAB, non la dà.
    const dest = join(dir, "forma.md");
    const days = probeOut({
      "strength_detail.html":
        "<table><tr><th>Lun</th><th>Mar</th></tr><tr><th>Durata</th><th>Calorie</th><th>N°</th></tr></table>",
    });
    expect(await main([days, dest])).toBe(0);
    expect(stderr).not.toHaveBeenCalled();
    rmSync(days, { recursive: true });
    const header = probeOut({
      "strength_detail.html":
        "<table><tr><th>N°</th><th>Serie</th><th>Kg eseguiti</th></tr><tr><th>Serien</th><th>Wdh</th></tr></table>",
    });
    expect(await main([header, dest])).toBe(0);
    expect(stderr.mock.calls).toEqual([
      [
        "Nota: una riga di intestazioni ha parole fuori da VOCAB, quindi le sue colonne non sono in ordine nel rapporto: tenere probe_out/ e scrivere a Claude le intestazioni della tabella delle serie.",
      ],
    ]);
  });

  it("cli: a section shows at most 5 shapes", async () => {
    const dest = join(dir, "forma.md");
    const src = probeOut({
      "strength_detail.html": "<p>Kg</p>",
      "strength_detail_2.html": "<p>Serie</p>",
      "strength_detail_3.html": "<p>a</p>",
      "strength_detail_4.html": "<p>A</p>",
      "strength_detail_5.html": "<p>1</p>",
      "strength_detail_6.html": "<p>Kg 1</p>",
    });
    expect(await main([src, dest])).toBe(0);
    const text = readFileSync(dest, "utf8");
    expect(text.slice(text.indexOf("## strength_detail"))).toBe(
      [
        "## strength_detail*.html",
        "",
        "```text",
        "p",
        '  "99"',
        "```",
        "",
        "```text",
        "p",
        '  "A"',
        "```",
        "",
        "```text",
        "p",
        '  "Kg 99"',
        "```",
        "",
        "```text",
        "p",
        '  "Kg"',
        "```",
        "",
        "```text",
        "p",
        '  "Serie"',
        "```",
        "",
        "… altre varianti",
        "",
      ].join("\n"),
    );
  });
});
