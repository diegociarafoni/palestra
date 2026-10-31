# Palestra Technogym – Piano di implementazione (SOSTITUITO)

> **Sostituito il 2026-10-31** da `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (TypeScript + Cloudflare D1, repository pubblico). Resta come riferimento per casi di test e valori attesi; non va eseguito.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizzare ogni notte le sessioni Mywellness/Technogym in JSON versionati nel repository, generare un report mensile che confronta la scheda con quanto eseguito e pubblicare una dashboard protetta su `<DASHBOARD_HOSTNAME>`.

**Architecture:** Pacchetto Python `palestra` con due sottomoduli: `palestra.sync` (client HTTP verso l'API privata Mywellness, normalizzazione nel formato `scheda/SCHEMA.md`, scrittura idempotente in `data/`) e `palestra.report` (lettura di `data/` + `scheda/scheda.json`, calcolo indicatori e regole di progressione di `docs/linee-guida-allenamento.md`, scrittura di `reports/AAAA-MM.md`). Un workflow GitHub Actions esegue la CLI con i Secrets e committa i risultati.

**Tech Stack:** Python ≥ 3.12, `uv`, `httpx`, `selectolax` (parsing HTML), `pytest` + `respx` (mock HTTP), `ruff`, `mypy` (strict). Nessun database.

**Spec:** `docs/superpowers/specs/2026-10-30-palestra-technogym-design.md` (letta insieme a `docs/mywellness-api.md`, `scheda/SCHEMA.md`, `docs/linee-guida-allenamento.md`).

## Global Constraints

- Python ≥ 3.12; dipendenze runtime limitate a `httpx`, `selectolax`; tutto il resto nella stdlib.
- Credenziali SOLO da variabili d'ambiente `MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`; mai in file del repository, mai nei log.
- Verso Mywellness: 1 login per esecuzione, ≤ 1 richiesta/secondo, 1 retry su 5xx, exit code ≠ 0 e messaggio esplicito su 401/403 o HTML inatteso.
- Formati dei file esattamente come `scheda/SCHEMA.md`; nomi file `data/sessions/YYYY-MM-DD_<session_id>.json`.
- Idempotenza: una seconda esecuzione senza nuove sessioni non modifica alcun file (il workflow non deve produrre commit vuoti).
- Lingua di report e messaggi: italiano. Codice e identificatori: inglese.
- Nessuna rete nei test: tutte le chiamate HTTP sono mockate con `respx` su fixture salvate in `tests/fixtures/`.

## Review Focus

1. Sessione senza esercizi di forza (solo cardio): il report deve elencarla nelle sessioni svolte senza generare righe vuote né errori di divisione. → Task 6, test `test_report_cardio_only_session`.
2. Nome esercizio in app diverso da `technogym_name` della scheda (es. "Lat Pulldown" vs "Lat Machine"): finisce in "Non riconosciuti", mai scartato in silenzio. → Task 6, test `test_report_unmatched_exercise_listed`.
3. Login fallito (password cambiata): la CLI termina con exit 78 e messaggio "Login Mywellness fallito", senza stampare la password e senza toccare `data/`. → Task 2, test `test_login_failure_raises`; Task 4, test `test_cli_exit_code_on_auth_error`.
4. Pagina HTML cambiata da Technogym (struttura inattesa in `PerformedExerciseDetailById`): errore esplicito `ParseError` con l'URL, non un JSON con campi `null` silenziosi. → Task 3, test `test_parse_strength_detail_unexpected_html_raises`.
5. Seduta a cavallo di mezzanotte o fuso orario diverso: la data del file è quella di `started_at` nel fuso `Europe/Rome`. → Task 3, test `test_session_filename_uses_rome_date`.

## Grafo delle dipendenze e parallelismo

```
Task 0 (probe via Actions) ──► Task 1 (scaffolding) ──┬──► 2 ──► 3 ──► 4 ──► 5   [corsia A: sync]
                                                             └──► 6                       [corsia B: report]
Task 9 (esplorazione scrittura, solo docs) ── indipendente, nel Progetto Claude
Task 10 (dashboard) dopo 6 · Task 11 (publish Cloudflare) dopo 5 e 10 · Task 7 (docs operative) dopo 11 · Task 8 (import ZIP) dopo 4 · Task 6b (step report nel workflow) dopo il merge di 5
```

- **Task 0 e Task 1 prima di tutto, in sequenza**: il Task 0 può cambiare i Task 2–3 (il suo Step 3 è l'unico passo manuale dell'utente); il Task 1 crea `pyproject.toml` e i pacchetti che entrambe le corsie toccano.
- **Due corsie al massimo** dopo il merge del Task 1: A (2→3→4→5) e B (6). Ogni corsia in un proprio worktree e branch `feat/<task>`; il Task 6 non tocca `src/palestra/sync/`; il contratto fra le corsie è `scheda/SCHEMA.md`, non il codice.
- Il Task 9 è lavoro di lettura e documentazione: lo svolge Claude nel Progetto, non un agente di sviluppo.
- Non più di due PR aperte in contemporanea: il GATE 3 ha un solo revisore umano.

## Criteri di accettazione per il GATE 3

Ogni PR riporta nella descrizione l'evidenza indicata nella riga **Accettazione** del proprio task (comando, output, exit code). L'utente confronta quella riga con la PR senza leggere il diff.

---

### Task 0: Verifica reale degli endpoint Mywellness tramite workflow "probe"

Contesto: lo sviluppo avviene in sessioni cloud (Progetto Claude / Claude Code web) senza accesso alla rete esterna e senza credenziali. Tutte le chiamate reali a Mywellness passano quindi da GitHub Actions con i Secrets; gli agenti lavorano solo su fixture.

**Files:**
- Create: `.github/workflows/probe.yml` (solo `workflow_dispatch`; `permissions: contents: read`; `timeout-minutes: 10`; action pinnate a SHA)
- Create: `scripts/probe_mywellness.py` (script autonomo, solo stdlib + `httpx`: login, elenco sessioni, dettaglio di una sessione, dettaglio di un esercizio di forza se presente, serie temporale cardio, ricerca dei dati biometrici/InBody mostrati in "I tuoi dati" (misura avviata dall'app Virgin Active, valori visibili nella Technogym App); scrive le risposte grezze in `probe_out/`)
- Create: `scripts/anonymize_fixtures.py` (sostituisce e-mail, userId, nomi, token e cookie con valori fittizi; fallisce se dopo la sostituzione trova ancora `@` in un campo e-mail o il valore di `MYWELLNESS_EMAIL`)
- Modify: `docs/mywellness-api.md` § 2 (endpoint confermati, parametri reali, forma delle risposte, data di verifica)
- Create (dall'utente, dopo il download dell'artifact): `tests/fixtures/login_ok.html`, `last_sessions.html`, `session_cardio_only.json`, `session_strength.json` (se disponibile), `strength_detail.html`, `cardio_timeseries.json`

**Interfaces:**
- Produces: la verità sugli endpoint per i Task 2 e 3 e le fixture per tutti i test. Se un endpoint differisce da `docs/mywellness-api.md`, si aggiorna il documento e, se serve, le firme dei Task 2–3 prima di iniziarli.

**Prerequisito (utente):** prima del run, una seduta reale con almeno un esercizio a registrazione manuale preso dal catalogo app (es. "Goblet squat" in Dumbbells Personal) con kg e ripetizioni inseriti nell'app, più un esercizio cardio connesso.

**Accettazione:** link a un run di `probe.yml` verde con artifact `fixtures-anonymized`; la fixture `session_strength.json` contiene l'esercizio registrato a mano con serie, ripetizioni e kg (se mancano, aprire subito il Task 8 come canale principale e annotarlo in `docs/mywellness-api.md`); `docs/mywellness-api.md` § 2 riporta "verificato il AAAA-MM-GG" per ogni endpoint; § 1 dice se la misura InBody è leggibile da Mywellness e con quali campi (se sì, si apre un PBI per importarla in `data/misure.json` al posto della trascrizione manuale); `grep -ri "@" tests/fixtures/` non restituisce e-mail reali; nessun segreto nei log del run.

- [ ] **Step 1**: scrivere `scripts/probe_mywellness.py` e `scripts/anonymize_fixtures.py` (test unitario minimo per l'anonimizzatore: un JSON con e-mail e userId reali → nessuna occorrenza dopo la funzione).
- [ ] **Step 2**: scrivere `probe.yml`: checkout e setup-uv pinnate a SHA, `uv run scripts/probe_mywellness.py` con `env` dai Secrets, poi `uv run scripts/anonymize_fixtures.py probe_out/ fixtures/`, `::add-mask::` sui token letti, upload di `fixtures/` come artifact (`retention-days: 7`). Le risposte grezze non vengono mai caricate né committate.
- [ ] **Step 3** (utente): avviare il workflow da Actions → scaricare l'artifact → copiare i file in `tests/fixtures/` → aprire una PR `docs: add anonymized mywellness fixtures`.
  **Alternativa se Actions non è disponibile**: l'utente esegue lo stesso script sul proprio computer, con le credenziali solo come variabili d'ambiente nel terminale (mai in file, chat o repository): `uv run scripts/probe_mywellness.py` e poi `uv run scripts/anonymize_fixtures.py probe_out/ fixtures/`; copia solo `fixtures/` in `tests/fixtures/` e cancella `probe_out/`. Lo script non deve dipendere da GitHub Actions per funzionare.
- [ ] **Step 4** (agente, in cloud): leggere le fixture, aggiornare `docs/mywellness-api.md` § 2 e, se necessario, le firme dei Task 2–3; commit `docs: verify mywellness endpoints`.

Nota: il workflow `probe.yml` è anche il test di contratto da rilanciare quando il sync notturno inizia a fallire per cambi di Technogym.

---

### Task 1: Scaffolding del pacchetto

**Accettazione:** la PR mostra `uv run pytest -q` → `1 passed`, `uv run ruff check .` → `All checks passed!`, `uv run ruff format --check .` e `uv run mypy src` senza errori, `uv.lock` committato.

**Files:**
- Create: `pyproject.toml`, `src/palestra/__init__.py`, `src/palestra/sync/__init__.py`, `src/palestra/report/__init__.py`, `tests/__init__.py`, `tests/test_smoke.py`, `.gitignore` (aggiornare), `data/.gitkeep`, `data/sessions/.gitkeep`, `data/timeseries/.gitkeep`, `reports/.gitkeep`

**Interfaces:**
- Produces: pacchetto importabile `palestra`; script console `palestra-sync` e `palestra-report` dichiarati in `[project.scripts]` che puntano a `palestra.sync.cli:main` e `palestra.report.cli:main` (implementati nei Task 4 e 6).

- [ ] **Step 1: Scrivere `pyproject.toml`** con `name = "palestra"`, `requires-python = ">=3.12"`, dipendenze `httpx>=0.27`, `selectolax>=0.3`, gruppo dev `pytest`, `respx`, `ruff`, `mypy`; `[project.scripts]` come sopra; `[tool.pytest.ini_options] testpaths = ["tests"]`; `[tool.ruff.lint] select = ["E", "F", "B", "I", "UP", "SIM", "RET", "PTH", "C4", "TC", "ISC"]`; `[tool.mypy] strict = true` (regola 10 di `CLAUDE.md`). Generare `uv.lock` con `uv sync` e committarlo.
- [ ] **Step 2: Scrivere il test di fumo**

```python
# tests/test_smoke.py
def test_package_imports():
    import palestra, palestra.sync, palestra.report
    assert palestra.__version__ == "0.1.0"
```

- [ ] **Step 3: Eseguire** `uv run pytest -q` → atteso: FAIL (modulo mancante).
- [ ] **Step 4: Creare i moduli vuoti** con `__version__ = "0.1.0"` in `src/palestra/__init__.py`.
- [ ] **Step 5: Eseguire** `uv run pytest -q` → atteso: PASS; `uv run ruff check .`, `uv run ruff format --check .` e `uv run mypy src` → nessun errore.
- [ ] **Step 5b: Scrivere `.github/workflows/ci.yml`**: trigger solo `pull_request`; `permissions: contents: read`; nessun segreto; `timeout-minutes: 10`; `actions/checkout` e `astral-sh/setup-uv` pinnate a SHA con `enable-cache: true`; passi `uv sync --locked`, `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy src`. Nota: i minuti Actions del piano gratuito sono esauriti fino a metà novembre 2026; l'utente ha attivato un budget di 5 $ con blocco al limite (consumo stimato dello sviluppo ~150 minuti ≈ 1 $). Usare solo runner `ubuntu-latest`.
- [ ] **Step 6: Commit** `chore: scaffold palestra package`

---

### Task 2: Client Mywellness – login ed elenco sessioni

**Accettazione:** la PR mostra `uv run pytest tests/test_client.py -q` → `4 passed` e la suite completa verde; nessuna chiamata di rete nei test (`respx` attivo su tutti).

**Files:**
- Create: `src/palestra/sync/client.py`, `tests/test_client.py`, `tests/fixtures/login_ok.html`, `tests/fixtures/last_sessions.html`

**Interfaces:**
- Produces:
  - `class MywellnessClient:`
    - `__init__(self, email: str, password: str, *, base_url: str = "https://www.mywellness.com", services_url: str = "https://services.mywellness.com", min_interval_s: float = 1.0)`
    - `login(self) -> None` — solleva `AuthError` su credenziali rifiutate
    - `list_session_ids(self, *, since: date | None = None) -> list[str]` — id nell'ordine restituito dal sito
    - `get_session(self, session_id: str) -> dict` — JSON grezzo di `GetPerformedWorkoutSessionByIdCr`
    - `get_strength_detail_html(self, exercise_id: str) -> str`
    - `get_cardio_timeseries(self, analytics_id: str) -> dict`
    - proprietà `user_id: str` (disponibile dopo `login`)
  - eccezioni in `src/palestra/sync/errors.py`: `SyncError`, `AuthError(SyncError)`, `ParseError(SyncError)`, `UpstreamError(SyncError)`
- Endpoint e comportamento: `docs/mywellness-api.md` § 2. Il primo sviluppatore DEVE verificare gli endpoint con una chiamata reale (credenziali proprie, fuori dai test) e aggiornare quel documento prima di registrare le fixture.

- [ ] **Step 1: Registrare le fixture** salvando (anonimizzate) la risposta HTML del login e della pagina `LastPerformedWorkoutSession` in `tests/fixtures/`.
- [ ] **Step 2: Scrivere i test**

```python
# tests/test_client.py
import respx, httpx, pytest
from palestra.sync.client import MywellnessClient
from palestra.sync.errors import AuthError

@respx.mock
def test_login_sets_user_id(fixtures):
    respx.post("https://www.mywellness.com/cloud/User/Login").mock(
        return_value=httpx.Response(200, text=fixtures("login_ok.html"), headers={"set-cookie": "ASP.NET_SessionId=x"}))
    c = MywellnessClient("a@b.it", "pw"); c.login()
    assert c.user_id == "<id presente nella fixture>"

@respx.mock
def test_login_failure_raises():
    respx.post("https://www.mywellness.com/cloud/User/Login").mock(return_value=httpx.Response(200, text="<html>Credenziali non valide</html>"))
    with pytest.raises(AuthError):
        MywellnessClient("a@b.it", "wrong").login()

@respx.mock
def test_list_session_ids_parses_ids(fixtures, logged_client):
    respx.get("https://www.mywellness.com/cloud/Training/LastPerformedWorkoutSession").mock(return_value=httpx.Response(200, text=fixtures("last_sessions.html")))
    assert logged_client.list_session_ids() == ["<id1>", "<id2>"]

@respx.mock
def test_retries_once_on_5xx(logged_client):
    route = respx.get("https://www.mywellness.com/cloud/Training/LastPerformedWorkoutSession")
    route.side_effect = [httpx.Response(502), httpx.Response(200, text="")]
    logged_client.list_session_ids()
    assert route.call_count == 2
```

Fixture `fixtures` (legge un file da `tests/fixtures/`) e `logged_client` (client già loggato via mock) in `tests/conftest.py`.

- [ ] **Step 3: Eseguire** `uv run pytest tests/test_client.py -q` → FAIL (import).
- [ ] **Step 4: Implementare `MywellnessClient` ed `errors.py`**: sessione `httpx.Client` con cookie; limitatore di frequenza semplice (`time.monotonic`); retry singolo su 5xx; `AuthError` quando dopo il login manca il cookie di sessione o la pagina contiene il form di login.
- [ ] **Step 5: Eseguire** i test → PASS. `ruff check` pulito.
- [ ] **Step 6: Commit** `feat(sync): mywellness client with login and session listing`

---

### Task 3: Normalizzazione delle sessioni

**Accettazione:** `uv run pytest tests/test_normalize.py -q` → `5 passed`; un file prodotto da `Session.to_dict()` su una fixture reale è allegato alla PR e rispetta `scheda/SCHEMA.md` § 2.

**Files:**
- Create: `src/palestra/sync/normalize.py`, `src/palestra/sync/models.py`, `tests/test_normalize.py`, `tests/fixtures/session_cardio_only.json`, `tests/fixtures/session_strength.json`, `tests/fixtures/strength_detail.html`, `tests/fixtures/strength_detail_broken.html`, `tests/fixtures/cardio_timeseries.json`

**Interfaces:**
- Consumes: JSON/HTML grezzi dal client (Task 2).
- Produces:
  - `@dataclass Session`, `Exercise`, `StrengthSet` in `models.py` con campi identici a `scheda/SCHEMA.md` § 2 e metodo `Session.to_dict() -> dict`.
  - `normalize_session(raw: dict, *, strength_details: dict[str, str], timeseries: dict[str, dict], tz: str = "Europe/Rome") -> Session`
  - `parse_strength_detail(html: str) -> list[StrengthSet]` — `ParseError` se la tabella serie non è trovata
  - `session_filename(session: Session) -> str` → `"YYYY-MM-DD_<session_id>.json"` con data in `Europe/Rome`
  - `timeseries_filename(session_id: str, order: int) -> str` → `"<session_id>_<order>.json"`

- [ ] **Step 1: Scrivere i test** (nomi e asserzioni):
  - `test_normalize_cardio_only_session`: dalla fixture cardio: `moves` e `exercises[0].distance_m` uguali ai valori letterali della fixture, `len(exercises) == 2`, `exercises[0].kind == "cardio"`, `exercises[0].sets == []`.
  - `test_normalize_strength_session_sets`: `exercises[1].sets[0] == StrengthSet(n=1, reps_target=12, reps_done=12, load_target_kg=60, load_done_kg=60)`.
  - `test_parse_strength_detail_unexpected_html_raises`: `strength_detail_broken.html` → `pytest.raises(ParseError)`.
  - `test_session_filename_uses_rome_date`: sessione con `started_at = 2026-10-29T23:30:00Z` → nome inizia con `2026-10-30_`.
  - `test_to_dict_matches_schema_keys`: chiavi di primo livello == `{"session_id","source","started_at","ended_at","name","program","moves","calories_kcal","duration_s","exercises"}`.
- [ ] **Step 2: Eseguire** → FAIL.
- [ ] **Step 3: Implementare** `models.py` e `normalize.py` (`selectolax` per l'HTML; `zoneinfo` per il fuso).
- [ ] **Step 4: Eseguire** → PASS.
- [ ] **Step 5: Commit** `feat(sync): normalize sessions to repository schema`

---

### Task 4: CLI `palestra-sync` idempotente

**Accettazione:** `uv run pytest -q` tutto verde, incluso `test_sync_is_idempotent`; la prova reale di idempotenza avviene nel Task 5 con due run consecutivi del workflow (il secondo senza commit).

**Files:**
- Create: `src/palestra/sync/store.py`, `src/palestra/sync/cli.py`, `tests/test_store.py`, `tests/test_cli_sync.py`

**Interfaces:**
- Consumes: `MywellnessClient` (Task 2), `normalize_session`, `session_filename` (Task 3).
- Produces:
  - `class Store:` `__init__(self, root: Path)`; `known_ids(self) -> set[str]`; `write_session(self, session: Session, timeseries: dict[int, dict]) -> Path`; `rebuild_index(self) -> None` (ordina per data decrescente, aggiorna `updated_at`).
  - `sync(client: MywellnessClient, store: Store, *, lookback_days: int = 14) -> int` — ritorna il numero di nuove sessioni scritte.
  - `main(argv: list[str] | None = None) -> int` con sottocomandi: `sync [--data DIR] [--lookback-days N]`, `import-zip PATH [--data DIR]` (stub che solleva `NotImplementedError` con messaggio "vedi docs/mywellness-api.md § 3" — resta per il Task 8). Exit code (convenzione `sysexits`, vedi `docs/buone-pratiche.md` § 8): 0 ok · 64 argomenti errati · 65 `ParseError` · 69 `UpstreamError` non transitorio · 75 errore transitorio/rate limit dopo i retry · 78 credenziali mancanti o `AuthError`.

- [ ] **Step 1: Scrivere i test**
  - `test_store_write_and_index(tmp_path)`: dopo `write_session` + `rebuild_index`, `index.json["sessions"][0]["file"] == "data/sessions/2026-10-29_abc123.json"` e `known_ids() == {"abc123"}`.
  - `test_sync_skips_known_sessions`: client fake che restituisce id `["abc123","def456"]`, store con `abc123` noto → `sync(...) == 1`, `get_session` chiamato solo per `def456`.
  - `test_sync_is_idempotent(tmp_path)`: seconda esecuzione → ritorna 0 e nessun file ha mtime cambiato.
  - `test_cli_exit_code_on_auth_error(monkeypatch)`: `login` solleva `AuthError` → `main(["sync","--data",str(tmp_path)]) == 78`, stderr contiene "Login Mywellness fallito", `tmp_path` resta vuota.
- [ ] **Step 2: Eseguire** → FAIL.
- [ ] **Step 3: Implementare** `store.py`, `cli.py` (`argparse`; credenziali da `os.environ`, errore esplicito se mancanti).
- [ ] **Step 4: Eseguire** → PASS.
- [ ] **Step 5: Commit** `feat(sync): idempotent store and CLI`

---

### Task 5: Workflow GitHub Actions

**Accettazione:** link a un run `workflow_dispatch` verde con un commit `data: sync sessions …` su `main`, e link a un run volutamente fallito (secret errato) rosso senza commit e senza password nei log.

**Files:**
- Create: `.github/workflows/sync.yml`

**Interfaces:**
- Consumes: `palestra-sync sync` (Task 4), `palestra-report` (Task 6, può essere aggiunto in quel task).

- [ ] **Step 1: Scrivere il workflow** con: `on: schedule: - cron: "17 3 * * *"` e `workflow_dispatch` (nessun altro trigger); `permissions: contents: read` a livello di workflow e `contents: write` solo sul job; `timeout-minutes: 15`; `concurrency: { group: sync, cancel-in-progress: false }`; job su `ubuntu-latest`: `actions/checkout` e `astral-sh/setup-uv` **pinnate a SHA completo** con la versione in commento, `enable-cache: true`, `uv sync --locked`, `uv run palestra-sync sync` con `env` dai Secrets `MYWELLNESS_EMAIL`/`MYWELLNESS_PASSWORD` (mai come argomenti né in `if:`); poi `git add data && git diff --cached --quiet || git commit -m "data: sync sessions $(date -u +%F)" && git push` con autore `github-actions[bot]`.
- [ ] **Step 1b: Scrivere `.github/dependabot.yml`** con `package-ecosystem: github-actions` e `package-ecosystem: uv`, cadenza `monthly`.
- [ ] **Step 2: Verificare** con `workflow_dispatch` dal tab Actions: esecuzione verde; se non ci sono sessioni nuove, nessun commit.
- [ ] **Step 3: Verificare la rottura controllata**: eseguire una volta con un secret volutamente errato (o `env` sovrascritto) → job rosso con "Login Mywellness fallito" nei log, nessun commit.
- [ ] **Step 4: Commit** `ci: nightly mywellness sync`

---

### Task 6: Report mensile

**Corsia B: parte dopo il merge del Task 1, in parallelo ai Task 2–5; non tocca `src/palestra/sync/` né `.github/`.**

**Accettazione:** `uv run pytest tests/test_metrics.py tests/test_progression.py tests/test_report_cli.py -q` → tutti verdi; `reports/2026-10.md` generato dalle fixture allegato alla PR con tutte le sezioni del `reports/TEMPLATE.md`.

**Files:**
- Create: `src/palestra/report/metrics.py`, `src/palestra/report/strength.py` (e1RM, best_set, strength_table), `src/palestra/report/progression.py`, `src/palestra/report/render.py`, `src/palestra/report/cli.py`, `tests/test_metrics.py`, `tests/test_strength.py`, `tests/test_progression.py`, `tests/test_report_cli.py`, `tests/fixtures/scheda_min.json`, `tests/fixtures/data_month/` (3–4 sessioni di esempio, almeno una con serie di forza), `tests/fixtures/misure.json`, `tests/fixtures/recupero.json`
- (Lo step del workflow è nel Task 6b, dopo il merge del Task 5.)

**Interfaces:**
- Consumes: `data/index.json`, `data/sessions/*.json`, `scheda/scheda.json`, `data/misure.json`, `data/recupero.json` (opzionale). Modello di riferimento per struttura e lettura: `reports/TEMPLATE.md`.
- Produces:
  - `load_month(data_dir: Path, month: str) -> list[dict]` (sessioni con `started_at` nel mese, fuso Europe/Rome)
  - `match_exercises(scheda: dict, sessions: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]` — mappa `slug → esecuzioni` e lista "non riconosciuti" (regola `scheda/SCHEMA.md` § 5)
  - `adherence(scheda: dict, sessions: list[dict], month: str) -> tuple[int, int]` (svolte, previste; previste = `sessions_per_week` × settimane ISO del mese che intersecano `[valid_from, valid_to]`)
  - `volume_by_muscle(scheda: dict, executions: dict[str, list[dict]]) -> dict[str, float]` (serie/settimana medie)
  - `next_prescription(exercise: dict, last_execution: dict | None) -> dict` con chiavi `load_kg`, `reps_target`, `action` ∈ {`increase`,`decrease`,`hold`,`calibrate`} secondo `docs/linee-guida-allenamento.md` § 3
  - `weekly_volume(sessions: list[dict]) -> list[dict]` — per settimana ISO: `sessions`, `sets`, `tonnage_kg` (Σ carico×rip), `kg_per_set`.
  - `e1rm(load_kg: float, reps: int) -> float` — Epley: `load * (1 + reps/30)`; `best_set(execution: dict) -> dict` (serie con e1RM massimo).
  - `strength_table(scheda: dict, executions: dict[str, list[dict]]) -> list[dict]` — per slug: prima/ultima serie migliore con data, e1RM inizio/fine, Δ %, sedute, `reliability` ∈ {`confermato`,`da rivedere`,`bloccato`} (regola in `docs/linee-guida-allenamento.md` § 3 "Metriche derivate").
  - `volume_by_pattern(scheda: dict, executions: dict[str, list[dict]]) -> dict[str, float]` e `ratios(by_muscle: dict, by_pattern: dict) -> dict` con chiavi `hamstring_quad`, `push_pull`, `vertical_push_sets`.
  - `status(indicator: str, value: float, baseline: float | None) -> str` ∈ {`ok`,`watch`,`fix`} secondo le soglie § 5 (entro il 10 % dall'obiettivo = `watch`).
  - `load_measures(path) -> list[dict]` che esclude dai trend le righe con `in_protocol == False`; `load_recovery(path) -> list[dict]` (file opzionale, lista vuota se assente).
  - `render_report(month: str, scheda: dict, sessions: list[dict], measures: list[dict], recovery: list[dict]) -> str` — Markdown con le 9 sezioni di `reports/TEMPLATE.md`, nell'ordine; le sezioni senza dati (Recupero, InBody) riportano "Nessun dato" senza errori.
  - `main(argv) -> int` : `palestra-report --month YYYY-MM [--data DIR] [--scheda FILE] [--out DIR]` scrive `reports/YYYY-MM.md`.

- [ ] **Step 1: Scrivere i test**
  - `test_next_prescription_increase`: ultima esecuzione 3 serie × 12 rip a 60 kg, `reps_max 12`, `step_kg 5` → `{"load_kg": 65, "reps_target": 10, "action": "increase"}`.
  - `test_next_prescription_decrease`: serie `[8, 9, 10]` con `reps_min 10` → `load_kg 55`, `action "decrease"`.
  - `test_next_prescription_hold`: `[11, 11, 10]` → `load_kg 60`, `reps_target 11`, `action "hold"`.
  - `test_next_prescription_calibrate_when_no_history`: `last_execution None`, `start_load_kg None` → `action "calibrate"`.
  - `test_adherence_counts_distinct_days`: due sessioni lo stesso giorno contano 1.
  - `test_e1rm_epley`: `e1rm(60, 10) == 80.0`; `e1rm(70, 10) == pytest.approx(93.33, abs=0.01)`.
  - `test_weekly_volume_tonnage`: una settimana con serie `(60,12),(60,12),(60,10)` → `tonnage_kg == 2040`, `sets == 3`, `kg_per_set == 680`.
  - `test_volume_counts_indirect_at_half`: esercizio con `muscle_groups ["quadricipiti"]`, `indirect_muscles ["femorali"]`, 3 serie → `quadricipiti 3.0`, `femorali 1.5`.
  - `test_ratios_hamstring_quad`: 22 serie femorali, 38 quadricipiti → `hamstring_quad == pytest.approx(0.58, abs=0.01)` e `status("hamstring_quad", 0.58, 0.6) == "watch"`.
  - `test_measures_out_of_protocol_excluded`: una misura con `in_protocol False` compare nella tabella ma non nel trend.
  - `test_report_without_recovery_file`: `recovery == []` → sezione 7 con "Nessun dato", nessuna eccezione.
  - `test_report_cardio_only_session`: il mese con sole sessioni cardio produce un report con sezione Esercizi che riporta "Nessuna esecuzione" per ogni slug di forza e senza eccezioni.
  - `test_report_unmatched_exercise_listed`: esecuzione "Lat Pulldown" → compare in "Non riconosciuti".
  - `test_cli_writes_file(tmp_path)`: `main([...]) == 0` e `reports/2026-11.md` esiste e contiene "# Report novembre 2026".
- [ ] **Step 2: Eseguire** → FAIL.
- [ ] **Step 3: Implementare** i quattro moduli.
- [ ] **Step 4: Eseguire** → PASS.
- [ ] **Step 5: Commit** `feat(report): monthly report with progression proposals`

---

### Task 6b: Report nel workflow (dopo il merge dei Task 5 e 6)

**Files:**
- Modify: `.github/workflows/sync.yml`

**Accettazione:** run `workflow_dispatch` verde che produce o aggiorna `reports/<mese corrente>.md` con commit `data: report AAAA-MM`.

- [ ] **Step 1**: aggiungere lo step `uv run palestra-report --month $(date -u +%Y-%m)` eseguito quando `date -u +%d` è `01` oppure su `workflow_dispatch`; includere `reports/` nel commit.
- [ ] **Step 2**: verificare con un run manuale; commit `ci: monthly report step`.

---

### Task 7: Documentazione operativa e Progetto Claude

**Accettazione:** README con comandi reali eseguiti e output; Progetto Claude creato con repository collegato (screenshot).

**Files:**
- Modify: `README.md`, `CLAUDE.md`
- Create: `reports/TEMPLATE.md` (struttura del report, usata da `render_report` come riferimento)

- [ ] **Step 1: README** – scopo, come funziona (diagramma della spec), comandi (`uv run palestra-sync sync`, `uv run palestra-report --month`), come inserire la scheda nella Technogym App, come fare la revisione mensile nel Progetto Claude, link ai documenti.
- [ ] **Step 2: CLAUDE.md** – già predisposto; aggiornare se i nomi dei comandi cambiano.
- [ ] **Step 3: Progetto Claude** (manuale, su claude.ai): creare il Progetto "Palestra", collegare il repository GitHub, incollare nelle istruzioni il contenuto di `CLAUDE.md` § "Revisione mensile".
- [ ] **Step 4: Commit** `docs: operating guide`

---

### Task 8 (opzionale, dopo l'MVP; obbligatorio se il Task 0 mostra che le serie manuali non sono esposte dall'API): Import dell'export ufficiale ZIP

**Files:**
- Create: `src/palestra/sync/import_zip.py`, `tests/test_import_zip.py`, `tests/fixtures/export_sample.zip`

**Interfaces:**
- Produces: `import_zip(path: Path, store: Store) -> int` che normalizza con `source = "export-zip"` e `sets = []` dove il dettaglio manca; collegato al sottocomando `import-zip` del Task 4.

- [ ] Documentare prima la struttura reale dello ZIP in `docs/mywellness-api.md` § 3, poi test → implementazione → commit `feat(sync): import official mywellness export`.

---

### Task 9 (esplorativo, fuori MVP): Scrittura della scheda verso Technogym

Non ha passi di codice finché `docs/mywellness-api.md` § 4 non documenta endpoint e payload verificati con un allenamento di test creato e cancellato. Criterio di ingresso: un allenamento creato via API compare nella Technogym App entro 1 minuto. Solo allora: nuovo sottocomando `palestra-sync push-scheda` con test su mock.

---

### Task 10: Dashboard statica (`palestra-dashboard`)

**Corsia B-bis: parte dopo il merge del Task 6 (riusa `load_month`, `match_exercises`, `adherence`, `next_prescription`). Non tocca `src/palestra/sync/` né `.github/`.**

Prima di scrivere il primo grafico, chi implementa legge la skill `dataviz` (o, in sua assenza, `docs/dashboard.md` § Grafici) per palette, forma dei grafici e leggibilità in tema chiaro/scuro.

**Accettazione:** `uv run palestra-dashboard --out /tmp/site` con le fixture di `tests/fixtures/data_month/` produce le quattro pagine; screenshot a 360 px e a 1024 px allegati alla PR; `uv run pytest tests/test_dashboard.py -q` verde; nessuna stringa `@` né `session_id` reali nell'HTML generato.

**Files:**
- Create: `src/palestra/dashboard/__init__.py`, `src/palestra/dashboard/build.py`, `src/palestra/dashboard/charts.py`, `src/palestra/dashboard/templates/` (`base.html`, `index.html`, `esercizi.html`, `scheda.html`, `misure.html` come stringhe `string.Template` o Jinja2 — Jinja2 è l'unica dipendenza nuova ammessa, da chiedere), `src/palestra/dashboard/static/style.css`, `src/palestra/dashboard/cli.py`, `tests/test_dashboard.py`
- Modify: `pyproject.toml` (`[project.scripts] palestra-dashboard = "palestra.dashboard.cli:main"`), `.gitignore` (`site/`)

**Interfaces:**
- Consumes: Task 6 (`load_month`, `match_exercises`, `adherence`, `next_prescription`), `scheda/scheda.json`, `data/misure.json`, `data/index.json`.
- Produces:
  - `build_site(repo_root: Path, out_dir: Path, today: date) -> list[Path]` — scrive le pagine e ritorna i percorsi. La home replica la sezione 1 del report: griglia di indicatori con valore, confronto e bollino ✓ ● !, più le tre frasi di chiusura dell'ultima revisione; `esercizi.html` mostra per ogni esercizio il grafico dell'e1RM per seduta e la tabella forza; `misure.html` peso/vita/InBody con le misure fuori protocollo evidenziate e, se presenti, le quattro serie di recupero.
  - `weekly_summary(sessions: list[dict], scheda: dict, today: date) -> dict` con chiavi `done`, `planned`, `moves_total`, `sessions` (lista con data, nome, MOVEs).
  - `exercise_series(executions: dict[str, list[dict]]) -> dict[str, list[tuple[date, float]]]` — per slug, serie (data, carico×rip massimo della seduta).
  - `svg_line_chart(series: list[tuple[date, float]], *, title: str, unit: str, width: int = 640, height: int = 240) -> str` e `svg_bar_chart(values: list[tuple[str, float]], *, title: str) -> str` in `charts.py`.
  - `main(argv) -> int`: `palestra-dashboard --out DIR [--root DIR] [--today YYYY-MM-DD]`.

- [ ] **Step 1: Scrivere i test**
  - `test_weekly_summary_counts_distinct_days`: due sessioni lo stesso giorno → `done == 1`; `planned == 2`.
  - `test_exercise_series_takes_best_set_per_session`: serie `[(12,60),(10,60)]` → valore `720.0` per quella data.
  - `test_svg_line_chart_is_valid_svg`: l'output inizia con `<svg`, contiene `title` e `unit`, e `xml.etree.ElementTree.fromstring` non solleva.
  - `test_build_site_writes_four_pages(tmp_path)`: ritorna 4 percorsi esistenti; `index.html` contiene "Settimana"; nessuna pagina contiene `@`.
  - `test_build_site_with_no_sessions(tmp_path)`: `data/` vuota → pagine generate con "Nessuna sessione" e nessuna eccezione.
  - `test_cli_exit_zero(tmp_path)`.
- [ ] **Step 2: Eseguire** → FAIL.
- [ ] **Step 3: Implementare** `build.py`, `charts.py`, template e CSS (tema chiaro/scuro con `prefers-color-scheme`, larghezza minima 360 px, nessun JS obbligatorio).
- [ ] **Step 4: Eseguire** → PASS; generare il sito dalle fixture e fare gli screenshot con Playwright (`uv run python -m playwright screenshot` o script equivalente).
- [ ] **Step 5: Commit** `feat(dashboard): static site generator`

---

### Task 11: Pubblicazione su Cloudflare Pages con Cloudflare Access (dopo il merge dei Task 5 e 10)

**Accettazione:** link a un run di `publish.yml` verde; `https://<DASHBOARD_HOSTNAME>` chiede l'autenticazione Cloudflare Access e, dopo il codice OTP, mostra la dashboard; `curl -I https://<DASHBOARD_HOSTNAME>` restituisce un redirect verso `cloudflareaccess.com` (prova che il sito non è pubblico); `robots.txt` con `Disallow: /`.

**Files:**
- Create: `.github/workflows/publish.yml`, `docs/dashboard.md`
- Modify: `README.md` (sezione Dashboard)

**Interfaces:**
- Consumes: `palestra-dashboard` (Task 10); secret `CLOUDFLARE_API_TOKEN` (token con permesso *Cloudflare Pages: Edit*), `CLOUDFLARE_ACCOUNT_ID`.

Ordine obbligatorio: gli Step 1–2 (manuali, utente) precedono il primo deploy con dati reali.

- [ ] **Step 1 (utente, pannello Cloudflare)**: creare il progetto Pages `palestra` (anche vuoto) e aggiungere il dominio personalizzato `<DASHBOARD_HOSTNAME>` (il DNS viene creato da Cloudflare).
- [ ] **Step 2 (utente, Zero Trust → Access → Applications)**: applicazione self-hosted su `<DASHBOARD_HOSTNAME>`, metodo di login "One-time PIN", policy Allow con `Emails` = la sua e-mail, durata sessione 1 mese. Verificare che la pagina (anche vuota) chieda il PIN.
- [ ] **Step 3**: scrivere `publish.yml`: trigger `workflow_run` (workflow `sync`, `types: [completed]`, solo se `conclusion == 'success'`), `push` su `scheda/**` e `src/palestra/dashboard/**`, `workflow_dispatch`; `permissions: contents: read`; `timeout-minutes: 10`; `concurrency: publish`; action pinnate a SHA; `uv sync --locked`; `uv run palestra-dashboard --out site`; `npx --yes wrangler@3 pages deploy site --project-name palestra --branch main --commit-dirty=true` con i due secret in `env:`.
- [ ] **Step 4**: scrivere `docs/dashboard.md`: cosa mostra, come si rigenera, configurazione Access passo per passo, come aggiungere un'e-mail, cosa fare se il deploy fallisce, sezione Grafici (palette, forma, leggibilità).
- [ ] **Step 5**: run manuale → verifica dell'accettazione → commit `ci: publish dashboard to Cloudflare Pages`.

---

## Ordine ed esecuzione

Task 0 → 1, poi corsia A (2 → 3 → 4 → 5) e corsia B (6 → 10) in parallelo, quindi 6b → 11 → 7 (MVP completo); 8 e 9 facoltativi. Ogni task è una PR verso `main` con revisione indipendente (`.claude/agents/reviewer.md`) prima del merge, che fa solo l'utente (GATE 3).
