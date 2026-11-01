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
import type { StrengthTable } from "../../../src/domain/metrics";
import { testi } from "../testi";
import { formatChangePct, formatNumber } from "../utils/numeri";

type StrengthRow = StrengthTable[number];
type SetRef = NonNullable<StrengthRow["first"]>;

type TabellaForzaProps = { rows: StrengthTable };

const formatSet = (s: SetRef): string =>
  testi.exercises.set(formatNumber(s.load_kg), s.reps);

// "prima → ultima", con "—" al posto di quella che manca; solo "—" se mancano entrambe.
function range<T>(
  from: T | null,
  to: T | null,
  format: (value: T) => string,
): string {
  if (from === null && to === null) return testi.missing;
  const side = (value: T | null) =>
    value === null ? testi.missing : format(value);
  return testi.exercises.range(side(from), side(to));
}

// Proposta per la seduta dopo, con le parole del report: "Mantieni → 65 kg × 12".
function nextStep({ load_kg, reps_target, action }: StrengthRow["next"]) {
  const step =
    load_kg === null && (action === "increase" || action === "decrease")
      ? ` ${testi.exercises.step}`
      : "";
  const target =
    load_kg === null
      ? testi.exercises.reps(reps_target)
      : testi.exercises.set(formatNumber(load_kg), reps_target);
  return testi.exercises.range(
    `${testi.exercises.actions[action]}${step}`,
    target,
  );
}

/**
 * Forza per esercizio nel mese, dalle metriche del report (nessun ricalcolo): serie migliore
 * della prima e dell'ultima seduta, e1RM, affidabilità e proposta per la seduta dopo. È anche
 * l'alternativa testuale del grafico dell'e1RM.
 */
export function TabellaForza({ rows }: TabellaForzaProps) {
  const titleId = useId();
  const { columns } = testi.exercises;
  return (
    <Stack component="section" spacing={1}>
      <Typography id={titleId} variant="h6" component="h2">
        {testi.exercises.tableTitle}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-labelledby={titleId}>
          <TableHead>
            <TableRow>
              <TableCell>{columns.name}</TableCell>
              <TableCell align="right">{columns.sessions}</TableCell>
              <TableCell>{columns.sets}</TableCell>
              <TableCell>{columns.e1rm}</TableCell>
              <TableCell align="right">{columns.change}</TableCell>
              <TableCell>{columns.reliability}</TableCell>
              <TableCell>{columns.next}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.slug}
                // Sul telefono la tabella scorre in orizzontale: i valori restano su una riga,
                // solo il nome dell'esercizio va a capo.
                sx={{ "& > td + td": { whiteSpace: "nowrap" } }}
              >
                <TableCell>{r.name}</TableCell>
                <TableCell align="right">{r.sessions}</TableCell>
                <TableCell>{range(r.first, r.last, formatSet)}</TableCell>
                <TableCell>
                  {range(r.e1rm_start_kg, r.e1rm_end_kg, formatNumber)}
                </TableCell>
                <TableCell align="right">
                  {formatChangePct(r.e1rm_delta_pct)}
                </TableCell>
                <TableCell>
                  {r.reliability === null
                    ? testi.missing
                    : testi.exercises.reliability[r.reliability]}
                </TableCell>
                <TableCell>{nextStep(r.next)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
