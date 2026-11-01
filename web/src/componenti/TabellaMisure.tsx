import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useId } from "react";
import type { Measure } from "../../../src/domain/types";
import { testi } from "../testi";
import { formatShortDateTime } from "../utils/date";
import { formatNumber } from "../utils/numeri";

type TabellaMisureProps = { measures: Measure[] };

// Colonne: intestazione, allineamento (i numeri a destra, intestazione compresa), testo della cella
// e `nowrap` per tenere su una riga data e ora (sul telefono il contenitore scorre in orizzontale).
const columns: {
  label: string;
  align?: "right";
  nowrap?: true;
  text: (m: Measure) => string;
}[] = [
  {
    label: testi.measures.columns.dateTime,
    nowrap: true,
    text: (m) => formatShortDateTime(m.date, m.time),
  },
  {
    label: testi.measures.columns.weight,
    align: "right",
    text: (m) => formatNumber(m.weight_kg),
  },
  {
    label: testi.measures.columns.waist,
    align: "right",
    text: (m) => formatNumber(m.waist_cm),
  },
  {
    label: testi.measures.columns.muscle,
    align: "right",
    text: (m) => formatNumber(m.skeletal_muscle_kg),
  },
  {
    label: testi.measures.columns.fatMass,
    align: "right",
    text: (m) => formatNumber(m.fat_mass_kg),
  },
  {
    label: testi.measures.columns.fatPct,
    align: "right",
    text: (m) => formatNumber(m.body_fat_pct),
  },
  { label: testi.measures.columns.condition, text: (m) => m.condition },
  {
    label: testi.measures.columns.inProtocol,
    text: (m) => (m.in_protocol ? testi.yes : testi.no),
  },
];

/** Tutte le misure, anche fuori protocollo: è anche l'alternativa testuale del grafico del peso. */
export function TabellaMisure({ measures }: TabellaMisureProps) {
  const titleId = useId();
  return (
    <Stack component="section" spacing={1}>
      <Typography id={titleId} variant="h6" component="h2">
        {testi.measures.tableTitle}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-labelledby={titleId}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.label}
                  align={column.align}
                  sx={column.nowrap && { whiteSpace: "nowrap" }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {measures.map((m) => (
              <TableRow key={`${m.date} ${m.time ?? ""} ${m.source}`}>
                {columns.map((column) => (
                  <TableCell
                    key={column.label}
                    align={column.align}
                    sx={column.nowrap && { whiteSpace: "nowrap" }}
                  >
                    {column.text(m)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
