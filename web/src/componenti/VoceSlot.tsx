import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { PlannedSlot } from "../../../src/domain/planning";
import { testi } from "../testi";
import { formatDay, formatDays } from "../utils/date";
import { StatoSlot } from "./StatoSlot";

type VoceSlotProps = { slot: PlannedSlot; children?: ReactNode };

/**
 * Uno slot programmato (voce di `Elenco`): seduta della scheda, stato, giorni ammessi, data
 * scelta o svolta e motivo, se ci sono; sotto, `children` (il feedback nel calendario).
 */
export function VoceSlot({ slot, children }: VoceSlotProps) {
  return (
    <Paper component="li" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={0.5}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography sx={{ fontWeight: "bold" }}>
            {testi.slot.schedaDay(slot.scheda_day)}
          </Typography>
          <StatoSlot status={slot.status} />
        </Stack>
        <Typography>{testi.slot.window(formatDays(slot.window))}</Typography>
        {slot.date !== null && (
          <Typography>{testi.slot.date(formatDay(slot.date))}</Typography>
        )}
        {slot.reason !== null && (
          <Typography>{testi.slot.reason(slot.reason)}</Typography>
        )}
        {children}
      </Stack>
    </Paper>
  );
}
