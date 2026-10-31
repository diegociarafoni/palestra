---
tipo: decisione
slug: 2026-10-31-vitest-plugin-al-posto-di-pool-workers
titolo: I test su D1 usano @cloudflare/vitest-plugin con Vitest 5
data: 2026-10-31
stato: accettata
aggiornato: 2026-10-31
---
# I test su D1 usano @cloudflare/vitest-plugin con Vitest 5

**Data**: 2026-10-31 · **Stato**: accettata · **Decisa da**: l'utente, su proposta di Claude (Task 1b)

## Decisione e motivazione
I test che girano nel runtime Workers (modulo `store` sul D1 locale di Miniflare) usano `@cloudflare/vitest-plugin` 1.x e Vitest 5.

- Il 2026-08-19 Cloudflare ha rinominato `@cloudflare/vitest-pool-workers` in `@cloudflare/vitest-plugin`. Il vecchio pacchetto (0.23) è deprecato, non riceve aggiornamenti, richiede Vitest ^4.1 e porta con sé 6 avvisi di sicurezza alti (solo strumenti di test). Il successore supporta Vitest ^4.1 e ^5, ha la stessa API di configurazione (`cloudflareTest`, `readD1Migrations`) e `npm audit` non segnala vulnerabilità.
- Vitest resta alla 5, installata nel Task 1: nessun ritorno alla 4.

## Alternative scartate
Seguire la nota iniziale del piano (Vitest 4.1 con `@cloudflare/vitest-pool-workers`): funziona, ma resta su un pacchetto deprecato e stampa un avviso a ogni esecuzione dei test.

## Note tecniche
- npm 10.9 (incluso in Node 22) va in errore (`edgesOut`) risolvendo le dipendenze di vite: le installazioni si fanno con `npx -y npm@11 install …`, poi si verifica `npm ci` con npm 10, che è quello usato in CI.
- MSW resta alla 2.x: è compatibile con `@vitest/mocker` sia di Vitest 4 sia di Vitest 5.
- Lo storage del D1 locale è isolato per file di test, non per singolo test: i test del modulo `store` svuotano le tabelle in `beforeEach`.

## Riferimenti
Piano `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (Task 1b, nota e Global Constraints), specifica `docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md` § 5c, `vitest.config.ts`.
