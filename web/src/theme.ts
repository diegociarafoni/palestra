import { createTheme } from "@mui/material/styles";
import type {} from "@mui/material/themeCssVarsAugmentation";

/**
 * Slot categoriali dei grafici, dalla skill dataviz (`references/palette.md`): l'ordine dei slot è
 * il meccanismo di sicurezza per i daltonici, quindi le serie prendono i slot in ordine (1, 2, 3…).
 * Con le variabili CSS si leggono da `theme.vars.palette.grafici`, che cambia con lo schema colore.
 */
export type PaletteGrafici = {
  serie1: string;
  serie2: string;
  serie3: string;
  serie4: string;
  serie5: string;
  serie6: string;
  serie7: string;
  serie8: string;
};

declare module "@mui/material/styles" {
  interface Palette {
    grafici: PaletteGrafici;
  }
  interface PaletteOptions {
    grafici?: PaletteGrafici;
  }
}

// Font di sistema: la CSP (web/public/_headers) non ammette font esterni.
const systemFont = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        grafici: {
          serie1: "#2a78d6",
          serie2: "#eb6834",
          serie3: "#1baf7a",
          serie4: "#eda100",
          serie5: "#e87ba4",
          serie6: "#008300",
          serie7: "#6250d6",
          serie8: "#e34948",
        },
      },
    },
    dark: {
      palette: {
        grafici: {
          serie1: "#3987e5",
          serie2: "#d95926",
          serie3: "#199e70",
          serie4: "#c98500",
          serie5: "#d55181",
          serie6: "#008300",
          serie7: "#9085e9",
          serie8: "#e66767",
        },
      },
    },
  },
  typography: { fontFamily: systemFont },
  components: {
    // Aree toccabili di almeno 48 px (docs/buone-pratiche-mui.md § 8).
    MuiButton: { styleOverrides: { root: { minHeight: 48 } } },
    MuiIconButton: { defaultProps: { size: "large" } },
    // Cinque voci in basso a 360 px: senza la larghezza minima di MUI (80 px) ognuna ha 72 px.
    MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0 } } },
    MuiMenuItem: {
      styleOverrides: {
        // Da `sm` in su MUI riduce l'altezza minima: qui resta 48 px a ogni larghezza.
        root: ({ theme }) => ({
          minHeight: 48,
          [theme.breakpoints.up("sm")]: { minHeight: 48 },
        }),
      },
    },
  },
});
