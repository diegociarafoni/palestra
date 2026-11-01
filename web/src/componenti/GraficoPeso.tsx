import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { LineChart } from "@mui/x-charts/LineChart";
import { useId } from "react";
import type { Measure } from "../../../src/domain/types";
import { testi } from "../testi";
import { chartDate, formatChartDate } from "../utils/date";
import { formatNumber } from "../utils/numeri";

type GraficoPesoProps = { measures: Measure[] };

/**
 * Peso nel tempo, solo con le misure in protocollo (stesse condizioni, confrontabili). Una serie:
 * nessuna legenda, il titolo dice cosa si vede; i valori esatti sono nella tabella delle misure.
 */
export function GraficoPeso({ measures }: GraficoPesoProps) {
  const theme = useTheme();
  const titleId = useId();
  const points = measures.filter((m) => m.in_protocol && m.weight_kg !== null);
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography id={titleId} variant="h6" component="h2">
        {testi.measures.chartTitle}
      </Typography>
      {points.length === 0 ? (
        <Typography>{testi.state.empty}</Typography>
      ) : (
        <LineChart
          height={240}
          hideLegend
          xAxis={[
            {
              // Asse del tempo: le distanze tra i punti seguono i giorni tra le misure.
              scaleType: "utc",
              data: points.map((m) => chartDate(m.date)),
              // Al più una tacca al giorno: con poche misure vicine le etichette non si ripetono.
              tickMinStep: 24 * 60 * 60 * 1000,
              valueFormatter: (value: Date) => formatChartDate(value),
            },
          ]}
          // Numeri come nella tabella (it-IT): tacche dell'asse e tooltip.
          yAxis={[
            {
              label: testi.measures.kg,
              valueFormatter: (value: number | null) => formatNumber(value),
            },
          ]}
          series={[
            {
              data: points.map((m) => m.weight_kg),
              label: testi.measures.weight,
              color: theme.vars.palette.grafici.serie1,
              // Un segno per misura: si vede anche una misura sola e dove cadono le date.
              showMark: true,
              valueFormatter: (value: number | null) => formatNumber(value),
            },
          ]}
        />
      )}
    </Stack>
  );
}
