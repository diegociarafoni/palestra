# Buone pratiche React (frontend della dashboard)

Regole per chi scrive il frontend in `web/`. Valgono insieme a `CLAUDE.md` e `docs/buone-pratiche.md`. Ogni regola rimanda alla pagina ufficiale da cui deriva, salvata in `docs/riferimenti/react/` (aggiornabile con `bash scripts/aggiorna-riferimenti.sh`). Se una regola qui contraddice la documentazione ufficiale, vince la documentazione: aggiornare questo file.

## 1. Contesto

- Applicazione a pagina singola (SPA) servita da Cloudflare Pages, nessun rendering lato server. Dati solo dall'API Hono (`/api/*`) dietro Cloudflare Access.
- React 19.3, `react-dom/client`, Vite, TypeScript `strict`. Interfaccia in italiano, mobile first (360 px), usata in palestra dal telefono.

## 2. Regole di React (obbligatorie)

Riferimenti: [`reference_rules.md`](riferimenti/react/reference_rules.md), [`reference_rules_components-and-hooks-must-be-pure.md`](riferimenti/react/reference_rules_components-and-hooks-must-be-pure.md), [`reference_rules_rules-of-hooks.md`](riferimenti/react/reference_rules_rules-of-hooks.md), [`learn_keeping-components-pure.md`](riferimenti/react/learn_keeping-components-pure.md).

- Componenti e hook **puri**: stesso input, stesso output; nessuna modifica di props, stato o variabili esterne durante il render.
- Hook solo al livello più alto di componenti e hook personalizzati; mai in condizioni, cicli o funzioni annidate.
- I componenti non si chiamano come funzioni (`<Card />`, non `Card()`); gli hook non si passano come valori.
- Props e stato sono immutabili: si sostituiscono, non si modificano.

## 3. Stato ed effetti

Riferimenti: [`learn_you-might-not-need-an-effect.md`](riferimenti/react/learn_you-might-not-need-an-effect.md), [`learn_choosing-the-state-structure.md`](riferimenti/react/learn_choosing-the-state-structure.md), [`learn_thinking-in-react.md`](riferimenti/react/learn_thinking-in-react.md).

- Lo stato minimo indispensabile: ciò che si calcola da props o stato si calcola durante il render, non si copia in un altro stato.
- Niente `useEffect` per dati derivati, per reagire a un evento dell'utente o per caricare dati: gli eventi si gestiscono negli handler, i dati con TanStack Query (§ 5).
- `useEffect` solo per sincronizzarsi con sistemi esterni al browser-React (es. un listener o un `ResizeObserver`), sempre con pulizia.
- Stato vicino a dove serve; si sale al genitore comune solo quando due componenti lo condividono.

## 4. React Compiler e prestazioni

Riferimenti: [`learn_react-compiler_introduction.md`](riferimenti/react/learn_react-compiler_introduction.md), [`learn_react-compiler_installation.md`](riferimenti/react/learn_react-compiler_installation.md).

- React Compiler attivo in Vite (`reactCompilerPreset` di `@vitejs/plugin-react` con `@rolldown/plugin-babel`). Di conseguenza non si scrivono `useMemo`, `useCallback` e `memo` a mano, salvo misura che li giustifichi (annotata con `Ruling:`).
- Ogni pagina è caricata con `lazy()` e `Suspense`, così il primo caricamento sul telefono contiene solo la pagina aperta.
- Budget: JavaScript iniziale ≤ 300 KB compressi; la PR che lo supera riporta la misura (`vite build` + dimensione gzip) e il motivo.

## 5. Dati dall'API

- Un solo client tipizzato: `hc<AppType>` di Hono, con i tipi dell'API importati dal backend. Nessuna URL scritta a mano nei componenti.
- Lettura con `useQuery` / `useSuspenseQuery` di TanStack Query; scrittura (feedback, conferma slot) con `useMutation` e invalidazione delle query interessate. Chiavi di query in un unico file `web/src/api/keys.ts`.
- Le risposte si validano con gli stessi schemi `zod` di `src/domain/` (unica fonte dei tipi).
- Stati sempre gestiti: caricamento (`Skeleton` MUI), errore (messaggio in italiano + "Riprova"), vuoto ("Nessun dato").
- Un `401/403` dall'API significa sessione Access scaduta: si ricarica la pagina, non si mostra un errore tecnico.
- Mai token, e-mail o identificativi nel codice del frontend, in `localStorage` o nei log della console.

## 6. Form (feedback e conferma slot)

Riferimenti: [`reference_react_useActionState.md`](riferimenti/react/reference_react_useActionState.md), [`reference_react_useOptimistic.md`](riferimenti/react/reference_react_useOptimistic.md).

- Componenti MUI controllati; validazione con lo schema `zod` condiviso prima dell'invio; errori mostrati sul campo.
- Pulsante "Salva" disabilitato e in stato di caricamento durante l'invio e finché il calendario ricaricato non è arrivato: dopo il successo la mutazione (`useMutation`, `web/src/api/scrittura.ts`) invalida calendario e settimane e ne aspetta il nuovo caricamento, così il pulsante esce dal caricamento quando la pagina mostra già il risultato. Se l'API risponde con errore il modulo conserva i valori scritti e mostra l'errore.
- Niente aggiornamento ottimistico della cache: la dashboard ha un solo utente e una scrittura alla volta, l'attesa è di un giro di rete, e così non servono id o `updated_at` inventati nella cache né un rollback da gestire. Unica eccezione "via interfaccia" (la variabile della mutazione, non la cache): la scelta del giorno mostra subito il giorno scelto durante l'invio e torna al valore del server se il salvataggio fallisce.

## 7. Struttura dei file

```
web/
  index.html
  src/
    main.tsx            # createRoot, StrictMode, ThemeProvider, QueryClientProvider, Router
    theme.ts            # tema MUI (vedi docs/buone-pratiche-mui.md)
    testi.ts            # tutte le stringhe dell'interfaccia
    api/                # client Hono, chiavi di query
    pagine/             # una cartella per pagina: settimana, esercizi, misure, scheda, report, calendario
    componenti/         # componenti condivisi (GraficoE1rm, StatoSlot, ModuloFeedback, …)
    utils/date.ts       # formattazione Europe/Rome con Intl
```

- Un componente per file, nome in PascalCase uguale al file; nessun `export default` tranne le pagine caricate con `lazy()`.
- Testi in `testi.ts`, date formattate solo con `utils/date.ts`.

## 8. TypeScript

Riferimento: [`learn_typescript.md`](riferimenti/react/learn_typescript.md).

- Props tipizzate con `type NomeProps = { … }`; niente `React.FC`; eventi con i tipi di React (`React.ChangeEvent<HTMLInputElement>`).
- Nessun `any`, nessun `as` per zittire il compilatore: si valida con `zod`.

## 9. StrictMode, Suspense, errori

Riferimenti: [`reference_react_StrictMode.md`](riferimenti/react/reference_react_StrictMode.md), [`reference_react_Suspense.md`](riferimenti/react/reference_react_Suspense.md).

- `<StrictMode>` sempre attivo.
- Un `ErrorBoundary` per pagina con messaggio in italiano; un errore in una pagina non spegne le altre.

## 10. Test

- Vitest + Testing Library (`@testing-library/react`, `@testing-library/user-event`) in ambiente `jsdom`; API simulata con MSW, mai rete.
- Si cerca per ruolo e testo visibile (`getByRole("button", { name: "Salva" })`), non per classi CSS o `data-testid` salvo assenza di alternative.
- Si testa il comportamento: cosa vede l'utente e cosa viene inviato all'API. Niente snapshot.
- Ogni pagina ha almeno: stato con dati, stato vuoto, stato d'errore.

## 11. Accessibilità

- Elementi interattivi raggiungibili da tastiera, etichette su ogni campo, contrasto AA (verificato sul tema chiaro e scuro).
- Le emoji del feedback hanno sempre l'etichetta testuale accanto ("😀 Ottima"), mai da sole.
