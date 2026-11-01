#!/usr/bin/env bash
# Prova di ripristino del backup mensile di D1, alternativa in locale al workflow restore-test
# (docs/dashboard.md, «Backup e ripristino»).
#
# Uso, dalla radice del repository, dopo `npm ci` e `npx wrangler login`:
#   bash scripts/prova-ripristino.sh [AAAA-MM-GG]    (default: la data di oggi a Roma)
#
# Scarica palestra-AAAA-MM-GG.sql dal bucket privato in una cartella temporanea, conta le
# righe INSERT di ogni tabella del dump (come restore-test), crea il database vuoto
# palestra-restore-test e vi importa il file; la cartella si cancella sempre. Su stdout, a
# import riuscito, solo l'intestazione, i nomi delle tabelle con i conteggi del dump (da
# confrontare con le righe di palestra-restore-test) e la riga finale di esito.
# L'output di wrangler non si mostra mai: in caso di errore può contenere righe del backup.
# Non usa mai il database palestra e non cancella palestra-restore-test.
# Exit code: 0 import completato · 64 argomenti non validi · 65 nome di tabella non ammesso
# nel dump · 69 backup vuoto, conteggio del dump o passo di wrangler non riuscito · 130
# interrotto (Ctrl+C, SIGTERM).
set -euo pipefail

readonly TARGET="palestra-restore-test"

date="${1:-$(TZ=Europe/Rome date +%F)}"
if [[ $# -gt 1 || ! "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Uso: bash scripts/prova-ripristino.sh [AAAA-MM-GG]" >&2
  exit 64
fi
key="palestra-${date}.sql"

dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
trap 'exit 130' INT TERM
file="$dir/backup.sql"

# step <descrizione> <argomenti di wrangler...>
step() {
  local what="$1"
  shift
  if WRANGLER_WRITE_LOGS=false WRANGLER_SEND_METRICS=false \
    npx --no -- wrangler "$@" </dev/null >/dev/null 2>&1; then
    echo "Fatto: $what" >&2
  else
    echo "Non riuscito: $what (wrangler exit $?)." \
      "Vedere docs/dashboard.md, «Alternativa in locale»." >&2
    exit 69
  fi
}

step "download di $key" r2 object get "palestra-backup/$key" --remote --jurisdiction eu --file "$file"
if [[ ! -s "$file" ]]; then
  echo "Backup vuoto: $key" >&2
  exit 69
fi
echo "Scaricato $key ($(wc -c <"$file" | tr -d ' ') byte)" >&2

# Righe `INSERT INTO "<tabella>"` per tabella, fino al primo indice, trigger o vista: l'export
# di D1 scrive una riga per INSERT e mette indici, trigger e viste dopo i dati (il corpo di un
# trigger può contenere un'INSERT). Escluse sqlite_* e _cf_*; un nome che non è un
# identificatore semplice non si stampa e ferma la prova (65). Stesse regole e stesso ordine
# dei nomi di src/cli/restore-test.ts (casi in test/fixtures/d1-export-casi-limite.sql), in awk
# POSIX, pensato anche per l'awk di macOS; `[ \t\r\f\v]` è il `\s` di JavaScript in ASCII.
# Il confronto è sui byte: a differenza di restore-test, un BOM iniziale e gli spazi Unicode non
# si riconoscono (l'export di D1 inizia con PRAGMA e usa parole chiave ASCII).
# Lo stderr di awk si scarta: in un errore di memoria può citare una riga del backup.
rc=0
counts="$(LC_ALL=C awk '
  toupper($0) ~ /^CREATE[ \t\r\f\v]+(UNIQUE[ \t\r\f\v]+)?(INDEX|TRIGGER|VIEW)[ \t\r\f\v]/ { exit }
  substr($0, 1, 13) == "INSERT INTO \"" {
    rest = substr($0, 14)
    endq = index(rest, "\"")
    after = substr(rest, endq + 1, 1)
    if (endq <= 1 || (after != " " && after != "(")) next
    name = substr(rest, 1, endq - 1)
    if (name ~ /^(sqlite_|_cf_)/) next
    if (name !~ /^[A-Za-z_][A-Za-z0-9_]*$/) { bad = 1; exit }
    count[name]++
  }
  END {
    if (bad) exit 65
    for (name in count) printf "%-18s%12d\n", name, count[name]
  }
' "$file" 2>/dev/null | LC_ALL=C sort)" || rc=$?
if ((rc == 65)); then
  echo "Nome di tabella non ammesso nel dump: $key" >&2
  exit 65
elif ((rc != 0)); then
  echo "Conteggio del dump non riuscito (exit $rc)." >&2
  exit 69
fi

step "creazione di $TARGET" d1 create "$TARGET" --jurisdiction eu
step "import in $TARGET" d1 execute "$TARGET" --remote --file "$file" --yes
printf '%-18s%12s\n' tabella dump
if [[ -n "$counts" ]]; then echo "$counts"; fi
echo "Import di $key in $TARGET completato; la copia locale è cancellata."
