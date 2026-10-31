import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import Skeleton from "@mui/material/Skeleton";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { retryQuery } from "./api/session";
import { ErrorBoundary } from "./componenti/ErrorBoundary";
import { Navigazione } from "./componenti/Navigazione";
import { paths } from "./percorsi";
import { theme } from "./theme";

// Ogni pagina è un chunk a parte: il primo caricamento contiene solo la pagina aperta.
const Settimana = lazy(() => import("./pagine/settimana/Settimana"));
const Calendario = lazy(() => import("./pagine/calendario/Calendario"));
const Esercizi = lazy(() => import("./pagine/esercizi/Esercizi"));
const Misure = lazy(() => import("./pagine/misure/Misure"));
const Scheda = lazy(() => import("./pagine/scheda/Scheda"));
const Report = lazy(() => import("./pagine/report/Report"));

const pages = [
  { path: paths.week, page: <Settimana /> },
  { path: paths.calendar, page: <Calendario /> },
  { path: paths.exercises, page: <Esercizi /> },
  { path: paths.measures, page: <Misure /> },
  { path: paths.scheda, page: <Scheda /> },
  { path: paths.report, page: <Report /> },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryQuery } },
});

const root = document.getElementById("root");
if (root === null) throw new Error("elemento #root mancante in index.html");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={theme} noSsr>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Navigazione />
          {/* Sotto `md` la navigazione è fissa in basso: il fondo della pagina resta visibile. */}
          <Container
            component="main"
            maxWidth="md"
            sx={{ pt: 2, pb: { xs: 10, md: 4 } }}
          >
            <Suspense fallback={<Skeleton variant="rounded" height={200} />}>
              <Routes>
                {pages.map(({ path, page }) => (
                  <Route
                    key={path}
                    path={path}
                    // La `key` dà a ogni pagina il suo ErrorBoundary: cambiando pagina l'errore sparisce.
                    element={<ErrorBoundary key={path}>{page}</ErrorBoundary>}
                  />
                ))}
              </Routes>
            </Suspense>
          </Container>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
