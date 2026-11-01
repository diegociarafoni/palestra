import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId } from "react";
import type { DashboardSlot } from "../../../../src/domain/dashboard";
import type { Weekday } from "../../../../src/domain/planning";
import type { Feedback } from "../../../../src/domain/types";
import { Elenco } from "../../componenti/Elenco";
import { VoceSlot } from "../../componenti/VoceSlot";
import { testi } from "../../testi";
import { isoWeekNumber } from "../../utils/date";
import { AzioniSlot } from "./AzioniSlot";

export type SlotWithFeedback = {
  slot: DashboardSlot;
  feedback: Feedback | undefined;
};

type SettimanaSlotProps = {
  week: string;
  slots: SlotWithFeedback[];
  /** Giorni della settimana non disponibili nel modello. */
  unavailable: Weekday[];
};

/** Gli slot di una settimana ISO del mese, ognuno con il suo feedback o le sue azioni. */
export function SettimanaSlot({
  week,
  slots,
  unavailable,
}: SettimanaSlotProps) {
  const titleId = useId();
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography id={titleId} variant="subtitle1" component="h3">
        {testi.calendar.week(isoWeekNumber(week))}
      </Typography>
      <Elenco>
        {slots.map(({ slot, feedback }) => (
          <VoceSlot key={slot.id} slot={slot}>
            <AzioniSlot
              slot={slot}
              feedback={feedback}
              unavailable={unavailable}
            />
          </VoceSlot>
        ))}
      </Elenco>
    </Stack>
  );
}
