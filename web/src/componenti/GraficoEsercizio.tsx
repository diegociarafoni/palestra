import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { LineChart } from "@mui/x-charts/LineChart";
import { useId } from "react";
import { testi } from "../testi";
import { chartDate, formatChartDate, formatChartDay } from "../utils/date";
import { formatNumber } from "../utils/numeri";

type GraficoEsercizioProps = {
  name: string;
  points: { date: string; e1rm_kg: number }[];
  /** Prima e ultima data dell'asse del tempo, uguali per tutti i grafici del mese. */
  from: string;
  to: string;
};

/**
 * e1RM di un esercizio nel mese: una serie sola, quindi nessuna legenda (il titolo è il nome
 * dell'esercizio) e un solo colore.
 */
export function GraficoEsercizio({
  name,
  points,
  from,
  to,
}: GraficoEsercizioProps) {
  const theme = useTheme();
  const titleId = useId();
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography id={titleId} variant="subtitle1" component="h3">
        {name}
      </Typography>
      <LineChart
        height={200}
        hideLegend
        xAxis={[
          {
            scaleType: "utc",
            data: points.map((p) => chartDate(p.date)),
            min: chartDate(from),
            max: chartDate(to),
            tickMinStep: 24 * 60 * 60 * 1000,
            // Etichette delle tacche ben distanziate: a due giorni l'una "6 ott" e "8 ott" si
            // toccherebbero (a 1024 px); MUI nasconde quelle più vicine di così.
            tickLabelMinGap: 16,
            // Tacche senza anno (giorni del mese scelto); nel tooltip la data completa.
            valueFormatter: (value: Date, context) =>
              context.location === "tick"
                ? formatChartDay(value)
                : formatChartDate(value),
          },
        ]}
        // Asse y proprio, numeri come nella tabella (it-IT): tacche dell'asse.
        yAxis={[
          {
            label: testi.exercises.kg,
            valueFormatter: (value: number | null) => formatNumber(value),
          },
        ]}
        series={[
          {
            data: points.map((p) => p.e1rm_kg),
            label: name,
            color: theme.vars.palette.grafici.serie1,
            // Un segno per seduta: una seduta sola nel mese è un punto, senza linea.
            showMark: true,
            valueFormatter: (value: number | null) =>
              value === null
                ? null
                : testi.exercises.e1rmValue(formatNumber(value)),
          },
        ]}
      />
    </Stack>
  );
}
