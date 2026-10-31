# Buone pratiche MUI (Material UI v9 e MUI X Charts)

Regole per l'uso di Material UI nel frontend `web/`. Valgono insieme a `docs/buone-pratiche-react.md`. Le pagine ufficiali di riferimento sono salvate in `docs/riferimenti/mui/` (aggiornabili con `bash scripts/aggiorna-riferimenti.sh`); se una regola qui le contraddice, vince la documentazione ufficiale e si aggiorna questo file.

## 1. Versioni e pacchetti

Riferimenti: [`getting-started_usage.md`](riferimenti/mui/getting-started_usage.md), [`getting-started_supported-platforms.md`](riferimenti/mui/getting-started_supported-platforms.md), [`x_react-charts_quickstart.md`](riferimenti/mui/x_react-charts_quickstart.md).

- `@mui/material` 9.x con `@emotion/react` e `@emotion/styled`; `@mui/icons-material` 9.x; `@mui/x-charts` 9.x, edizione Community (MIT). Nessun pacchetto Pro/Premium.
- Browser supportati da v9: Chrome 117, Edge 121, Firefox 121, Safari 17: sufficienti per il telefono.
- Niente altre librerie di componenti o CSS (Tailwind, Bootstrap, styled-components).

## 2. Tema: un solo file, `web/src/theme.ts`

Riferimenti: [`customization_theming.md`](riferimenti/mui/customization_theming.md), [`customization_dark-mode.md`](riferimenti/mui/customization_dark-mode.md), [`customization_css-theme-variables_overview.md`](riferimenti/mui/customization_css-theme-variables_overview.md), [`customization_palette.md`](riferimenti/mui/customization_palette.md), [`customization_theme-components.md`](riferimenti/mui/customization_theme-components.md).

- `createTheme({ cssVariables: true, colorSchemes: { light: …, dark: … } })`: modalità predefinita `system`, cioè il tema del telefono; si usa `colorSchemes`, non `palette` da sola (la documentazione la indica come API più limitata).
- `<ThemeProvider theme={theme}>` e `<CssBaseline />` una sola volta in `main.tsx`.
- Colori, spaziature, raggi e tipografia solo dal tema (`theme.palette`, `theme.spacing`, variabili CSS `var(--mui-…)`); nessun colore esadecimale nei componenti.
- Palette dei grafici definita nel tema (estensione tipizzata con module augmentation, vedi [`guides_typescript.md`](riferimenti/mui/guides_typescript.md)), seguendo la skill `dataviz` per contrasto in chiaro e scuro.
- Personalizzazioni globali di un componente in `theme.components[Nome].styleOverrides` / `defaultProps` / `variants`, non ripetute nei singoli usi.

## 3. Stile dei singoli componenti

Riferimento: [`customization_how-to-customize.md`](riferimenti/mui/customization_how-to-customize.md).

Ordine di preferenza:
1. tema (§ 2) per ciò che vale ovunque;
2. prop `sx` per una variazione locale e puntuale;
3. `styled()` per un componente riutilizzato con stile proprio (in `componenti/`).

- Mai `style={{…}}` in linea né fogli CSS separati, tranne `web/index.html` minimo.
- Layout: `Stack` per colonne e righe, `Grid` con la prop `size` per le griglie responsive; niente `GridLegacy`, niente `Grid` con `direction="column"`, niente "system props" su `Box` (si usa `sx`).

## 4. API dei componenti in v9

Riferimenti: [`guides_composition.md`](riferimenti/mui/guides_composition.md), [`react-text-field.md`](riferimenti/mui/react-text-field.md).

- Personalizzazione delle parti interne solo con `slots` / `slotProps` (es. `TextField` → `slotProps.htmlInput` per `maxLength`). Le vecchie prop `*Props`, `*Component`, `components`, `componentsProps`, `inputProps` sono rimosse in v9 e non si usano.
- `Dialog` / `Modal`: la chiusura con Esc si gestisce leggendo `reason` in `onClose` (la prop `disableEscapeKeyDown` non esiste più).
- Le icone `*Outline` sono state rimosse: si usano i nomi `*Outlined`.

## 5. Import

Riferimento: [`guides_minimizing-bundle-size.md`](riferimenti/mui/guides_minimizing-bundle-size.md).

- Import per percorso, non dai file "barile": `import Button from '@mui/material/Button'`, `import SaveIcon from '@mui/icons-material/Save'`. In produzione il risultato è uguale, ma in sviluppo gli import dal barile rallentano molto avvio e ricompilazione (le icone fino a sei volte).
- Regola Biome `noRestrictedImports` su `@mui/material` e `@mui/icons-material` importati dalla radice.

## 6. Componenti scelti per la dashboard

Riferimenti: [`react-bottom-navigation.md`](riferimenti/mui/react-bottom-navigation.md), [`react-toggle-button.md`](riferimenti/mui/react-toggle-button.md).

| Uso | Componente |
| --- | --- |
| Navigazione tra le sei pagine sul telefono | `BottomNavigation` (fino a 5 voci visibili + "Altro"), `Tabs` da `md` in su |
| Indicatori del mese | `Card` + `Typography` + `Chip` colorato per lo stato ✓ ● ! (con testo, non solo colore) |
| Calendario | griglia `Grid`/`Stack` di `ButtonBase` per giorno, stato con `Chip` e icona |
| Modulo feedback | `ToggleButtonGroup` esclusivo per le cinque classi (emoji + etichetta, `aria-label` sul gruppo), `Checkbox` + `TextField` "dove", `TextField` multiriga "Note (facoltative)", `Button` "Salva" con `loading` |
| Conferma slot saltato | `Dialog` (`fullScreen` sotto `sm`) con `RadioGroup` dei motivi |
| Caricamento / errore / vuoto | `Skeleton`, `Alert` con azione "Riprova", testo "Nessun dato" |
| Report mensile | `react-markdown` con `remark-gfm` e mappatura degli elementi su `Typography`, `Table`, `Link` di MUI |
| Grafici | `LineChart` (e1RM, peso) e `BarChart` (volume per settimana e per distretto) di `@mui/x-charts`; altezza esplicita, titolo e unità sempre visibili, colori dal tema |

## 7. Grafici (MUI X Charts)

Riferimenti: [`x_react-charts_lines.md`](riferimenti/mui/x_react-charts_lines.md), [`x_react-charts_bars.md`](riferimenti/mui/x_react-charts_bars.md).

- Dati già pronti dall'API (tabella `metrics`): il componente non ricalcola nulla.
- Ogni grafico ha titolo, unità sull'asse, legenda solo con più serie, e un'alternativa testuale (tabella o frase) per l'accessibilità.
- Un grafico senza dati mostra "Nessun dato", non assi vuoti.

## 8. Mobile e accessibilità

Riferimento: [`getting-started_accessibility.md`](riferimenti/mui/getting-started_accessibility.md).

- Progettare prima per 360 px; aree toccabili ≥ 48 px; testo base ≥ 16 px.
- Ogni campo con etichetta visibile; ogni icona-pulsante con `aria-label` in italiano.
- Stato mai comunicato dal solo colore: sempre testo o icona.
- Contrasto AA verificato su entrambi gli schemi colore.

## 9. Test

- Componenti renderizzati nei test con lo stesso `ThemeProvider` dell'app (`test/web/render.tsx` esporta `renderConTema`).
- Si interroga per ruolo ed etichetta (`getByRole("button", { name: "Ottima" })`), non per classi `Mui*`.
