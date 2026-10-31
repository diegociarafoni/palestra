# Schema dati: scheda e sessioni

Tutti i file sono JSON UTF-8, chiavi in `snake_case`, date ISO 8601 (`YYYY-MM-DD`, orari `YYYY-MM-DDTHH:MM:SS+01:00`).

## 0. Tabelle D1

I dati vivono nel database Cloudflare D1 `palestra`, creato da `migrations/0001_init.sql`. Le sezioni 1–5 descrivono il formato delle colonne `json`: i percorsi di file nei loro titoli sono storici. Date, istanti e JSON sono `TEXT`; ogni scrittura manuale (dashboard o connettore) aggiunge una riga in `audit` nella stessa operazione, la sync e il job del report no.

| Tabella | Colonne | Chiavi e vincoli | Colonna `json` | Chi scrive |
| --- | --- | --- | --- | --- |
| `sessions` | `session_id`, `date`, `started_at`, `json` | PK `session_id`; `date` = data in Europe/Rome di `started_at`, indicizzata | § 2 (una seduta) | sync |
| `timeseries` | `session_id`, `ord`, `json` | PK (`session_id`, `ord`); `session_id` → `sessions`; `ord` = `exercises[].order` | serie temporale grezza dell'esercizio | sync |
| `measures` | `id`, `date`, `json` | PK `id` intero; `date` indicizzata | § 4 (una misura) | Claude via connettore, con `audit` |
| `recovery` | `week`, `json` | PK `week` (`YYYY-Www`) | § 4b (una settimana) | Claude via connettore, con `audit` |
| `planned_sessions` | `id`, `week`, `slot`, `window_days`, `date`, `scheda_day`, `status`, `reason`, `session_id` | PK `id` (`<week>-<slot>`); UNIQUE (`week`, `slot`); `week` indicizzata; `window_days` = array JSON di date; `status` ∈ {`programmata`, `fatta`, `spostata`, `da_confermare`, `saltata`}; `date`, `reason`, `session_id` facoltativi | — | sync; dashboard, con `audit` |
| `feedback` | `id`, `planned_id`, `session_id`, `date`, `seq`, `class`, `joint_pain`, `joint_where`, `notes`, `updated_at` | PK `id` intero; UNIQUE (`date`, `seq`): un feedback per seduta, `seq` = ordine della seduta nel giorno (1 la prima, default), così si può salvare prima della sync; `planned_id` e `session_id` facoltativi e UNIQUE (una seduta collegata ha al massimo un feedback), senza chiavi esterne (il feedback può precedere la sync); `class` ∈ {`ottima`, `buona`, `normale`, `faticosa`, `pessima`}; `joint_pain` 0/1; `joint_where`, `notes` facoltativi | — | dashboard o Claude via connettore, con `audit` |
| `profile` | `key`, `json` | PK `key` | valore della chiave (es. `livello`, `obiettivo`, `protocollo_bia`) | Claude via connettore, con `audit` |
| `scheda` | `version`, `valid_from`, `valid_to`, `json`, `md` | PK `version` (`AAAA-MM`); `valid_from` e `valid_to` obbligatori, uguali (con `version`) ai campi del `json`; `json` e `md` cambiano insieme | § 1 | Claude via connettore (revisione mensile), con `audit` |
| `reports` | `month`, `kind`, `md`, `created_at` | PK (`month`, `kind`); `kind` ∈ {`report`, `revisione`} | — (Markdown in `md`) | job del report (`report`); Claude via connettore (`revisione`), con `audit` |
| `metrics` | `month`, `key`, `json` | PK (`month`, `key`) | valore della metrica | job del report |
| `audit` | `id`, `at`, `actor`, `table_name`, `row_key`, `action` | PK `id` intero; `action` ∈ {`insert`, `update`, `delete`} | — | insieme a ogni scrittura manuale |

Nelle sedute il campo `timeseries_ref` (§ 2) è superato dalla chiave `timeseries(session_id, ord)` e resta solo come campo facoltativo storico.

## 1. `scheda/scheda.json`

```json
{
  "version": "2026-11",
  "valid_from": "2026-11-03",
  "valid_to": "2026-11-30",
  "goal": "ricomposizione",
  "sessions_per_week": 2,
  "days": [
    {
      "id": "A",
      "name": "Giorno A",
      "blocks": [
        {
          "type": "warmup",
          "exercises": [
            {"slug": "skillbike-warmup", "technogym_name": "Skillbike", "equipment": "Skillbike",
             "duration_min": 8, "target": "RPE 4-5", "tracking": "auto"}
          ]
        },
        {
          "type": "strength",
          "exercises": [
            {"slug": "leg-press", "technogym_name": "Leg Press", "equipment": "Selection Leg Press",
             "muscle_groups": ["quadricipiti", "glutei"], "sets": 3, "reps_min": 10, "reps_max": 12,
             "indirect_muscles": ["femorali", "polpacci"], "movement_pattern": "squat",
             "rest_s": 90, "start_load_kg": null, "step_kg": 5, "tracking": "auto-if-900",
             "notes": "Piedi a larghezza spalle, al centro della pedana; non bloccare le ginocchia"}
          ]
        },
        {
          "type": "cardio",
          "exercises": [
            {"slug": "run-artis-incline-walk", "technogym_name": "Run Artis", "equipment": "Run Artis",
             "duration_min": 12, "target": "6-6,5 km/h, pendenza 6 %", "tracking": "auto"}
          ]
        }
      ]
    }
  ]
}
```

Campi obbligatori per esercizio: `slug` (stabile nel tempo: è la chiave per confrontare i mesi), `technogym_name` (come nel catalogo della Technogym App), `equipment`, `tracking` ∈ {`auto`, `auto-if-900`, `manual`}. Per la forza: `sets`, `reps_min`, `reps_max`, `rest_s`, `step_kg`, `muscle_groups` (distretti primari), `indirect_muscles` (distretti secondari, contati al 50 % nel volume), `movement_pattern` ∈ {`spinta-orizzontale`, `spinta-verticale`, `tirata-orizzontale`, `tirata-verticale`, `squat`, `hinge`, `flessione-ginocchio`, `core`, `altro`}.

Campi opzionali a livello di scheda: `cycle` (`{"number": 1, "block": 1, "weeks": 4, "phase": "avvio|accumulo|intensificazione|scarico"}`) e `goals` (lista di `{"slug", "today", "target", "criterion", "priority"}`), usati dal report per la sezione "Prossimo ciclo". `start_load_kg` è `null` finché non viene tarato alla prima seduta; poi viene aggiornato nel file a ogni revisione.

## 2. `data/sessions/YYYY-MM-DD_<session_id>.json`

Una sessione Mywellness normalizzata.

```json
{
  "session_id": "abc123",
  "source": "mywellness-api",
  "started_at": "2026-11-04T10:00:00+01:00",
  "ended_at": "2026-11-04T10:40:00+01:00",
  "name": "Seduta libera",
  "program": null,
  "moves": 400,
  "calories_kcal": 300,
  "duration_s": 2400,
  "exercises": [
    {
      "order": 1,
      "name": "Esercizio con obiettivo calorie",
      "equipment": "Skillbike",
      "kind": "cardio",
      "duration_s": 900,
      "calories_kcal": 120,
      "distance_m": 6000,
      "moves": 180,
      "timeseries_ref": "data/timeseries/abc123_1.json",
      "sets": []
    },
    {
      "order": 2,
      "name": "Leg Press",
      "equipment": "Selection Leg Press",
      "kind": "strength",
      "sets": [
        {"n": 1, "reps_target": 12, "reps_done": 12, "load_target_kg": 60, "load_done_kg": 60},
        {"n": 2, "reps_target": 12, "reps_done": 11, "load_target_kg": 60, "load_done_kg": 60}
      ],
      "compliance_pct": 95
    }
  ]
}
```

`program` è il nome del programma/seduta della Technogym App se la sessione è stata avviata da un programma (es. `"Fase 1 – Seduta 1"`), altrimenti `null`. `source` ∈ {`mywellness-api`, `export-zip`, `manual`}.

## 3. `data/index.json`

```json
{
  "updated_at": "2026-11-05T03:17:40Z",
  "sessions": [
    {"session_id": "abc123", "date": "2026-11-04", "name": "Seduta libera", "moves": 400, "file": "data/sessions/2026-11-04_abc123.json"}
  ]
}
```

Ordinato per data decrescente. È l'unico file letto dalla sync per decidere cosa scaricare.

## 4. `data/misure.json`

```json
[
  {"date": "2026-11-03", "time": "08:10", "weight_kg": 0.0, "waist_cm": 0.0,
   "skeletal_muscle_kg": null, "fat_mass_kg": null, "body_fat_pct": null,
   "condition": "digiuno", "in_protocol": true, "source": "inbody|bilancia|manuale", "note": ""}
]
```

Compilato a mano una volta a settimana, sempre nelle stesse condizioni (stesso giorno, stessa ora, a digiuno). I campi di composizione corporea arrivano dall'InBody del club quando disponibile. `in_protocol: false` segna una misura fatta in condizioni diverse: il report la mostra ma non la usa per i trend.

## 4b. `data/recupero.json` (opzionale)

```json
[
  {"week": "2026-W45", "sleep_h": 7.1, "steps_avg": 9100, "hrv_ms": 46, "rhr_bpm": 58, "source": "garmin|health-connect|manuale"}
]
```

Una riga per settimana ISO, da export dell'orologio. Usato dal report per la sezione "Recupero" e dalla regola di scarico anticipato (`docs/linee-guida-allenamento.md` § 3).

## 5. Mappatura esercizio ↔ sessione

Il report collega un esercizio della scheda a quelli eseguiti tramite `technogym_name` (confronto case-insensitive, spazi normalizzati) e, in subordine, tramite `equipment`. Le corrispondenze mancate vanno elencate nel report in una sezione "Non riconosciuti", mai scartate in silenzio.
