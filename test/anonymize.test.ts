import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
import { anonymize, DAY_OFFSETS, main } from "../scripts/anonymize-fixtures";

// Valori inventati: nessun dato reale.
const EMAIL = "mario.rossi@example.com";
const USER_ID = "3f2a9c1e-7b4d-4e8a-9c6f-1d2e3f4a5b6c";
const NAME = "Mario Rossi";
const TOKEN = "Tk9QZXJzb25hbFRva2VuMTIz";
const COOKIE = "c0ok1eValue-abcdef0123456789";

describe("anonymize", () => {
  it("anonymize: removes identities and shifts dates", () => {
    const input = [
      `{"email":"${EMAIL}","userId":"${USER_ID}","displayName":"${NAME}",`,
      `"token":"${TOKEN}","cookie":"_mwappseu=${COOKIE}",`,
      `"startedOn":"2026-03-01 15:17:08 +01:00","next":"2026-03-04 15:17:08 +01:00",`,
      `"kg":62.5,"kgText":"62,5","reps":12,"target":60}`,
    ].join("");
    const output = anonymize(input, {
      identities: [EMAIL, USER_ID, NAME, TOKEN, COOKIE],
      dayOffset: -100,
    });
    // Date calcolate a parte (GNU date): 2026-03-01 − 100 giorni = 2025-11-21, ancora a
    // 3 giorni dalla seconda; carichi e ripetizioni invariati.
    expect(output).toBe(
      [
        '{"email":"utente@example.com","userId":"00000000-0000-4000-8000-000000000002","displayName":"anon-3",',
        '"token":"anon-4","cookie":"_mwappseu=anon-5",',
        '"startedOn":"2025-11-21 15:17:08 +01:00","next":"2025-11-24 15:17:08 +01:00",',
        '"kg":62.5,"kgText":"62,5","reps":12,"target":60}',
      ].join(""),
    );
  });

  it("anonymize: shifts every known date format and leaves other numbers alone", () => {
    const input = [
      "iso 2026-02-27T23:30:00.123Z | 2026-10-30T08:05:00+02:00 | day=2024-04-18",
      "list 01/03/2026 31/12/2025 fromDate=01%2F03%2F2026",
      "compact <td class='date'>20260301</td> timeStamp: 20240418084053",
      "ids 1234567890 202603011 20261345 19991231 20240418996053",
      "loads 62,5 60 0.20260301 20260301.5 a20260301",
      "guid 20260301-ab12-4c3d-8e9f-0123456789ab",
      "invalid 2026-02-30 0001-01-01T00:00:00 31/02/2026",
    ].join("\n");
    // Date calcolate a parte (GNU date) con uno spostamento di −100 giorni.
    expect(anonymize(input, { identities: [], dayOffset: -100 })).toBe(
      [
        "iso 2025-11-19T23:30:00.123Z | 2026-07-22T08:05:00+02:00 | day=2024-01-09",
        "list 21/11/2025 22/09/2025 fromDate=21%2F11%2F2025",
        "compact <td class='date'>20251121</td> timeStamp: 20240109084053",
        "ids 1234567890 202603011 20261345 19991231 20240418996053",
        "loads 62,5 60 0.20260301 20260301.5 a20260301",
        "guid 20260301-ab12-4c3d-8e9f-0123456789ab",
        "invalid 2026-02-30 0001-01-01T00:00:00 31/02/2026",
      ].join("\n"),
    );
  });

  it("anonymize: replaces encoded and differently cased identities and other e-mails", () => {
    const input = [
      '<a href="/x?u=mario.rossi%40example.com&n=Mario+Rossi&f=Mario%20Rossi">Ciao MARIO, mario rossi</a>',
      `{"n":"Niccol\\u00F2 D'Amico","u":"NICCOLÒ D'AMICO","q":"Niccol%C3%B2+D%27Amico"}`,
      "contatti: Supporto.Club@palestra-esempio.it ?to=altro.utente%40palestra-esempio.it",
      "Mamma mia",
    ].join("\n");
    const output = anonymize(input, {
      // Vuote e di 1–2 caratteri ignorate: non identificano e cambierebbero tutto il testo.
      identities: [EMAIL, "Mario", NAME, "Niccolò D'Amico", "", "M"],
      dayOffset: -100,
    });
    expect(output).toBe(
      [
        '<a href="/x?u=utente%40example.com&n=anon-3&f=anon-3">Ciao anon-2, anon-3</a>',
        '{"n":"anon-4","u":"anon-4","q":"anon-4"}',
        "contatti: utente@example.com ?to=utente%40example.com",
        "Mamma mia",
      ].join("\n"),
    );
  });
});

describe("anonymize-fixtures", () => {
  let dir: string;
  let src: string;
  let dest: string;
  let stdout: MockInstance;
  let stderr: MockInstance;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "anonymize-fixtures-"));
    src = join(dir, "probe_out");
    dest = join(dir, "fixtures");
    mkdirSync(src);
    stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
    stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  // Pagina sintetica: profilo nel formato `JSON.parse('...')` con le virgolette escapate.
  const LOGIN_OK = String.raw`<script>
EU.currentUser = JSON.parse('{\"id\":\"${USER_ID}\",\"token\":\"${TOKEN}\",\"culture\":\"it-IT\",\"name\":\"Mario\",\"surname\":\"Rossi\",\"email\":\"${EMAIL}\",\"weight\":81.5,\"nickName\":\"L\u0027orso\"}');
</script>
<p>Ciao Mario Rossi</p>
`;
  it("anonymize-fixtures: day offsets are never a whole number of weeks", () => {
    // Uno spostamento di settimane intere lascerebbe i giorni reali di allenamento.
    expect(DAY_OFFSETS).toHaveLength(318);
    expect(DAY_OFFSETS[0]).toBe(-400);
    expect(DAY_OFFSETS.at(-1)).toBe(-30);
    for (const offset of DAY_OFFSETS) {
      expect(offset % 7).not.toBe(0);
      expect(offset).toBeGreaterThanOrEqual(-400);
      expect(offset).toBeLessThanOrEqual(-30);
    }
  });

  it("anonymize-fixtures: writes anonymized copies and keeps only id, token and culture of the profile", async () => {
    writeFileSync(
      join(src, "identities.json"),
      JSON.stringify([EMAIL, USER_ID, TOKEN, "Mario", "Rossi"]),
    );
    writeFileSync(join(src, "login_ok.html"), LOGIN_OK);
    writeFileSync(
      join(src, "session_strength.json"),
      `{"data":{"startedOn":"2026-03-01 15:17:08 +01:00","userId":"${USER_ID}","kg":62.5}}`,
    );
    writeFileSync(join(src, "note.txt"), EMAIL);
    expect(await main([src, dest], { dayOffset: -100 })).toBe(0);
    expect(readdirSync(dest).sort()).toEqual([
      "login_ok.html",
      "session_strength.json",
    ]);
    expect(readFileSync(join(dest, "login_ok.html"), "utf8")).toBe(
      String.raw`<script>
EU.currentUser = JSON.parse('{\"id\":\"00000000-0000-4000-8000-000000000002\",\"token\":\"anon-3\",\"culture\":\"it-IT\"}');
</script>
<p>Ciao anon-4 anon-5</p>
`,
    );
    expect(readFileSync(join(dest, "session_strength.json"), "utf8")).toBe(
      '{"data":{"startedOn":"2025-11-21 15:17:08 +01:00","userId":"00000000-0000-4000-8000-000000000002","kg":62.5}}',
    );
    // Solo nomi dei file e conteggio: mai il contenuto, mai lo spostamento.
    expect(stdout.mock.calls).toEqual([
      ["login_ok.html"],
      ["session_strength.json"],
      ["2 file anonimizzati"],
    ]);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("anonymize-fixtures: exit 78 without identities.json", async () => {
    writeFileSync(join(src, "login_ok.html"), LOGIN_OK);
    expect(await main([src, dest], { dayOffset: -100 })).toBe(78);
    expect(existsSync(dest)).toBe(false);
    expect(stderr.mock.calls).toEqual([
      [`identities.json mancante in ${src}: eseguire prima il probe`],
    ]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("anonymize-fixtures: exit 65 with an invalid identities.json", async () => {
    writeFileSync(join(src, "identities.json"), JSON.stringify({ EMAIL }));
    writeFileSync(join(src, "login_ok.html"), LOGIN_OK);
    expect(await main([src, dest], { dayOffset: -100 })).toBe(65);
    expect(existsSync(dest)).toBe(false);
    expect(stderr.mock.calls).toEqual([
      ["identities.json non valido: serve un array di stringhe"],
    ]);
  });

  it.each([[[]], [["probe_out"]], [["a", "b", "c"]]])(
    "anonymize-fixtures: exit 64 with arguments %j",
    async (argv) => {
      expect(await main(argv, { dayOffset: -100 })).toBe(64);
      expect(stderr.mock.calls).toEqual([
        [
          "Uso: npx tsx scripts/anonymize-fixtures.ts <cartella_probe> <cartella_fixture>",
        ],
      ]);
    },
  );

  it.each([
    {
      label: "no profile",
      page: '<form action="/cloud/User/Login"></form>',
      message: "login_ok.html: EU.currentUser non trovato",
    },
    {
      label: "no token",
      page: String.raw`EU.currentUser = JSON.parse('{\"id\":\"${USER_ID}\",\"email\":\"${EMAIL}\"}');`,
      message: "login_ok.html: EU.currentUser senza id o token",
    },
    {
      label: "broken json",
      page: String.raw`EU.currentUser = JSON.parse('{\"email\":\"${EMAIL}\",');`,
      message: "login_ok.html: EU.currentUser non interpretabile",
    },
  ])(
    "anonymize-fixtures: exit 65 and no file written ($label)",
    async ({ page, message }) => {
      // Il profilo completo non deve mai uscire: si fallisce prima di scrivere.
      writeFileSync(join(src, "identities.json"), "[]");
      writeFileSync(join(src, "last_sessions.html"), "<p>ok</p>");
      writeFileSync(join(src, "login_ok.html"), page);
      expect(await main([src, dest], { dayOffset: -100 })).toBe(65);
      expect(existsSync(dest)).toBe(false);
      expect(stderr.mock.calls).toEqual([[message]]);
      expect(stdout).not.toHaveBeenCalled();
    },
  );
});
