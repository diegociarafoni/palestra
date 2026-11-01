import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { LineChart } from "@mui/x-charts/LineChart";
import { useId } from "react";
import type { E1rmSeries } from "../../../src/domain/metrics";
import { testi } from "../testi";
import { chartDate, formatChartDate } from "../utils/date";
import { formatNumber } from "../utils/numeri";

type GraficoE1rmProps = { series: E1rmSeries };

/**
 * e1RM nel mese, una linea per esercizio con almeno una seduta. Ogni esercizio prende lo slot
 * della palette della sua posizione nella lista (skill dataviz: slot in ordine, il colore segue
 * l'esercizio); la legenda dà i nomi, la tabella della forza i valori esatti.
 */
export function GraficoE1rm({ series }: GraficoE1rmProps) {
  const theme = useTheme();
  const titleId = useId();
  const { grafici } = theme.vars.palette;
  const palette = [
    grafici.serie1,
    grafici.serie2,
    grafici.serie3,
    grafici.serie4,
    grafici.serie5,
    grafici.serie6,
    grafici.serie7,
    grafici.serie8,
  ];
  // Oltre l'ottavo esercizio la palette finisce e non ricomincia: quegli esercizi restano solo
  // nella tabella, e il grafico lo dice.
  const lines = series.flatMap((s, index) => {
    const color = palette[index];
    return color !== undefined && s.points.length > 0 ? [{ ...s, color }] : [];
  });
  const beyondPalette = series
    .slice(palette.length)
    .some((s) => s.points.length > 0);
  // Un solo asse del tempo per tutte le linee: le date di tutte le sedute, in ordine.
  const dates = [
    ...new Set(lines.flatMap((s) => s.points.map((p) => p.date))),
  ].toSorted();
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography id={titleId} variant="h6" component="h2">
        {testi.exercises.chartTitle}
      </Typography>
      {beyondPalette && (
        <Typography>{testi.exercises.chartLimit(palette.length)}</Typography>
      )}
      {lines.length === 0 ? (
        <Typography>{testi.state.empty}</Typography>
      ) : (
        <LineChart
          height={280}
          xAxis={[
            {
              scaleType: "utc",
              data: dates.map(chartDate),
              tickMinStep: 24 * 60 * 60 * 1000,
              valueFormatter: (value: Date) => formatChartDate(value),
            },
          ]}
          yAxis={[{ label: testi.exercises.kg }]}
          series={lines.map((s) => ({
            id: s.slug,
            label: s.name,
            color: s.color,
            // Nelle date delle altre linee l'esercizio non ha punti: la linea li scavalca.
            data: dates.map(
              (date) => s.points.find((p) => p.date === date)?.e1rm_kg ?? null,
            ),
            connectNulls: true,
            // Un segno per seduta: una seduta sola nel mese è un punto, senza linea.
            showMark: true,
            valueFormatter: (value: number | null) =>
              value === null
                ? null
                : testi.exercises.e1rmValue(formatNumber(value)),
          }))}
        />
      )}
    </Stack>
  );
}
