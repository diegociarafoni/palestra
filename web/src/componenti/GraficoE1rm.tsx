import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId } from "react";
import type { E1rmSeries } from "../../../src/domain/metrics";
import { testi } from "../testi";
import { GraficoEsercizio } from "./GraficoEsercizio";

type GraficoE1rmProps = { series: E1rmSeries };

/**
 * e1RM nel mese a piccoli multipli: un grafico per esercizio con almeno una seduta, nell'ordine
 * della lista, ognuno con il suo asse y (da ~10 a ~150 kg su un asse solo le variazioni non si
 * vedrebbero). Gli esercizi senza sedute restano solo nella tabella della forza.
 */
export function GraficoE1rm({ series }: GraficoE1rmProps) {
  const titleId = useId();
  // Due sedute nello stesso giorno danno due punti nella stessa data: resta il migliore, come la
  // "serie migliore" della seduta.
  const charts = series.flatMap((s) => {
    const best = new Map<string, number>();
    for (const p of s.points) {
      best.set(p.date, Math.max(p.e1rm_kg, best.get(p.date) ?? p.e1rm_kg));
    }
    const points = [...best].map(([date, e1rm_kg]) => ({ date, e1rm_kg }));
    return points.length > 0 ? [{ ...s, points }] : [];
  });
  // Stesso asse del tempo per tutti i grafici: dalla prima all'ultima data con un punto.
  const dates = charts.flatMap((c) => c.points.map((p) => p.date)).toSorted();
  const first = dates[0];
  const last = dates.at(-1);
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography id={titleId} variant="h6" component="h2">
        {testi.exercises.chartTitle}
      </Typography>
      {first === undefined || last === undefined ? (
        <Typography>{testi.state.empty}</Typography>
      ) : (
        <Grid container spacing={2}>
          {charts.map((s) => (
            <Grid key={s.slug} size={{ xs: 12, sm: 6 }}>
              <GraficoEsercizio
                name={s.name}
                points={s.points}
                from={first}
                to={last}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
