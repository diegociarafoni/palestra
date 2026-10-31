---
tipo: decisione
slug: 2026-10-30-dashboard-cloudflare-access
titolo: Dashboard su Cloudflare Pages protetta da Cloudflare Access
data: 2026-10-30
stato: accettata
aggiornato: 2026-10-30
---
# Dashboard su Cloudflare Pages protetta da Cloudflare Access

**Data**: 2026-10-30 · **Stato**: accettata

## Decisione e motivazione
Sito statico generato dal repo e pubblicato con `wrangler pages deploy` da GitHub Actions; protezione con Access (OTP via e-mail) invece della cifratura con parola d'ordine, perché il contenuto cambia ogni notte.

## Alternative scartate
Scartata: cifratura lato build; pubblicazione senza protezione.

## Riferimenti
spec § 7b; piano Task 10–11
