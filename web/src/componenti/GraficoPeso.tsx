import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { LineChart } from "@mui/x-charts/LineChart";
import { useId } from "react";
import type { Measure } from "../../../src/domain/types";
import { testi } from "../testi";
import { formatShortDate } from "../utils/date";

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
              scaleType: "point",
              data: points.map((m) => m.date),
              valueFormatter: (date: string) => formatShortDate(date),
            },
          ]}
          yAxis={[{ label: testi.measures.kg }]}
          series={[
            {
              data: points.map((m) => m.weight_kg),
              label: testi.measures.weight,
              color: theme.vars.palette.grafici.serie1,
            },
          ]}
        />
      )}
    </Stack>
  );
}
