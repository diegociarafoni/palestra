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
import { formatShortDate } from "../utils/date";
import { formatNumber } from "../utils/numeri";

type TabellaMisureProps = { measures: Measure[] };

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
              {testi.measures.columns.map((column) => (
                <TableCell key={column}>{column}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {measures.map((m) => (
              <TableRow key={`${m.date} ${m.time ?? ""} ${m.source}`}>
                <TableCell>
                  {m.time === null
                    ? formatShortDate(m.date)
                    : `${formatShortDate(m.date)}, ${m.time}`}
                </TableCell>
                <TableCell align="right">{formatNumber(m.weight_kg)}</TableCell>
                <TableCell align="right">{formatNumber(m.waist_cm)}</TableCell>
                <TableCell align="right">
                  {formatNumber(m.skeletal_muscle_kg)}
                </TableCell>
                <TableCell align="right">
                  {formatNumber(m.fat_mass_kg)}
                </TableCell>
                <TableCell align="right">
                  {formatNumber(m.body_fat_pct)}
                </TableCell>
                <TableCell>{m.condition}</TableCell>
                <TableCell>{m.in_protocol ? testi.yes : testi.no}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
