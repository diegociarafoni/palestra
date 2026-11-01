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
import type { SessionSummary } from "../../../../src/domain/dashboard";
import { testi } from "../../testi";
import { formatDay } from "../../utils/date";
import { formatNumber } from "../../utils/numeri";

type TabellaSeduteProps = { sessions: SessionSummary[]; movesTotal: number };

/** Sedute svolte nella settimana (anche le extra) con i MOVEs e il loro totale, o "Nessun dato". */
export function TabellaSedute({ sessions, movesTotal }: TabellaSeduteProps) {
  const titleId = useId();
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography id={titleId} variant="h6" component="h2">
        {testi.week.sessionsTitle}
      </Typography>
      {sessions.length === 0 ? (
        <Typography>{testi.state.empty}</Typography>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-labelledby={titleId}>
              <TableHead>
                <TableRow>
                  <TableCell>{testi.week.columns.date}</TableCell>
                  <TableCell>{testi.week.columns.name}</TableCell>
                  <TableCell align="right">
                    {testi.week.columns.moves}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map((s, index) => (
                  // Il riassunto non ha id: data e posizione, in una lista che non si riordina.
                  <TableRow key={`${s.date} ${index}`}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDay(s.date)}
                    </TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell align="right">{formatNumber(s.moves)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography>
            {testi.week.movesTotal(formatNumber(movesTotal))}
          </Typography>
        </>
      )}
    </Stack>
  );
}
