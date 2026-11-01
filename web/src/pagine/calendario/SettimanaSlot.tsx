import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId } from "react";
import type { DashboardSlot } from "../../../../src/domain/dashboard";
import type { Feedback } from "../../../../src/domain/types";
import { Elenco } from "../../componenti/Elenco";
import { VoceSlot } from "../../componenti/VoceSlot";
import { testi } from "../../testi";
import { isoWeekNumber } from "../../utils/date";
import { FeedbackSeduta } from "./FeedbackSeduta";

export type SlotWithFeedback = {
  slot: DashboardSlot;
  feedback: Feedback | undefined;
};

type SettimanaSlotProps = { week: string; slots: SlotWithFeedback[] };

/** Gli slot di una settimana ISO del mese, ognuno con il suo feedback se c'è. */
export function SettimanaSlot({ week, slots }: SettimanaSlotProps) {
  const titleId = useId();
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography id={titleId} variant="subtitle1" component="h3">
        {testi.calendar.week(isoWeekNumber(week))}
      </Typography>
      <Elenco>
        {slots.map(({ slot, feedback }) => (
          <VoceSlot key={slot.id} slot={slot}>
            {feedback && <FeedbackSeduta feedback={feedback} />}
          </VoceSlot>
        ))}
      </Elenco>
    </Stack>
  );
}
