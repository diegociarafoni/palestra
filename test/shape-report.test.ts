import { describe, expect, it } from "vitest";
import {
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
      'userId: "9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a"',
      'name: "A A"',
      'token: "a-a-a-9999999999"',
      'cookie: "_a=a99a9a-a-a-a-9999"',
      'startedOn: "9999-99-99 99:99:99 +99:99"',
      'endedOn: "9999-99-99T99:99:99Z"',
      "load: numero 99",
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
    expect(maskText("12,5 km", VOCAB)).toBe("99,9 km");
    expect(maskText("1.234 MOVEs", VOCAB)).toBe("9.999 MOVEs");
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
      "distance",
      "distanza",
      "durata",
      "duration",
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
      "rep",
      "reps",
      "rip",
      "ripetizioni",
      "rpm",
      "sec",
      "serie",
      "set",
      "sets",
      "speed",
      "spm",
      "strength",
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
      "    hr: numero 999",
      "empty: []",
      "none: {}",
    ]);
    // Le forme diverse nell'ordine in cui compaiono, al massimo 5.
    expect(shapeOfJson([1, 22, "x", 3, [true], null, {}, false], ctx)).toEqual([
      "- numero 9",
      "- numero 99",
      '- "a"',
      "- - booleano",
      "- null",
      "… altre varianti",
    ]);
  });

  it("shape: masks data-like keys and identity keys", () => {
    const lines = shapeOfJson(
      {
        "2026-10-29": { hr2: 120 },
        "2026-10-30": { hr2: 118 },
        "2026-10-31": "riposo",
        "123456": "x",
        u123456: "x",
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
      "  hr2: numero 999",
      '«9999-99-99»: "a"',
      '«a999999»: "a"',
      "«A»: numero 9",
      "«a»: numero 9",
      "«a a»: numero 9",
      "hr2: numero 9",
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
      '  id: "9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a"',
      "  sets:",
      "    - kg: numero 99",
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
      '        id: "9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a"',
      '        firstName: "A"',
      "        weight: numero 99.9",
      "    a[class=profile-link, href=«/a/A/9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a»]",
      '      "A A"',
      "    table[class=sets]",
      "      tr",
      "        th",
      '          "Serie"',
      "        th",
      '          "Ripetizioni"',
      "        th",
      '          "Carico"',
      // Anche le celle consecutive uguali (12 e 60 hanno la stessa forma).
      "      tr (ripetuto)",
      "        td",
      '          "9"',
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
    expect(maskText("%4Dario", VOCAB)).toBe("%9A");
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
});
