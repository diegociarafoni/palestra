import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { SessionSummary } from "../../../../src/domain/dashboard";
import { testi } from "../../testi";
import { formatDay } from "../../utils/date";
import { formatNumber } from "../../utils/numeri";

type VoceExtraProps = { session: SessionSummary; children?: ReactNode };

/** Una seduta extra (voce di `Elenco`): nome, data e MOVEs; sotto, `children` (il feedback). */
export function VoceExtra({ session, children }: VoceExtraProps) {
  return (
    <Paper component="li" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={0.5}>
        <Typography sx={{ fontWeight: "bold" }}>{session.name}</Typography>
        <Typography>{testi.slot.date(formatDay(session.date))}</Typography>
        <Typography>
          {testi.calendar.moves(formatNumber(session.moves))}
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}
