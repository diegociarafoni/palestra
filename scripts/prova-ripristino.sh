#!/usr/bin/env bash
# Prova di ripristino del backup mensile di D1, alternativa in locale al workflow restore-test
# (docs/dashboard.md, «Backup e ripristino»).
#
# Uso, dalla radice del repository, dopo `npm ci` e `npx wrangler login`:
#   bash scripts/prova-ripristino.sh [AAAA-MM-GG]    (default: la data di oggi a Roma)
#
# Scarica palestra-AAAA-MM-GG.sql dal bucket privato in una cartella temporanea, crea il
# database vuoto palestra-restore-test e vi importa il file; la cartella si cancella sempre.
# L'output di wrangler non si mostra mai: in caso di errore può contenere righe del backup.
# Non usa mai il database palestra e non cancella palestra-restore-test.
# Exit code: 0 import completato · 64 argomenti non validi · 69 backup vuoto o passo di
# wrangler non riuscito · 130 interrotto (Ctrl+C, SIGTERM).
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
step "creazione di $TARGET" d1 create "$TARGET" --jurisdiction eu
step "import in $TARGET" d1 execute "$TARGET" --remote --file "$file" --yes
echo "Import di $key in $TARGET completato; la copia locale è cancellata."
