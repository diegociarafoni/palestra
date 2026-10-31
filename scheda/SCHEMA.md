# Schema dati: scheda e sessioni

Tutti i file sono JSON UTF-8, chiavi in `snake_case`, date ISO 8601 (`YYYY-MM-DD`, orari `YYYY-MM-DDTHH:MM:SS+01:00`).

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
