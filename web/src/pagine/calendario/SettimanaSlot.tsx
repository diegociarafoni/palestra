import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId, useRef, useState } from "react";
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

/**
 * Gli slot di una settimana ISO del mese, ognuno con il suo feedback o le sue azioni. Dopo una
 * scelta salvata ("Saltata?", giorno scelto) il focus va al titolo della settimana, che resta
 * mentre i controlli dello slot cambiano o spariscono, e l'esito si annuncia.
 */
export function SettimanaSlot({
  week,
  slots,
  unavailable,
}: SettimanaSlotProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState("");
  const saved = (message: string) => {
    titleRef.current?.focus();
    setStatus(message);
  };
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1}>
      <Typography
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        variant="subtitle1"
        component="h3"
      >
        {testi.calendar.week(isoWeekNumber(week))}
      </Typography>
      <Typography role="status">{status}</Typography>
      <Elenco>
        {slots.map(({ slot, feedback }) => (
          <VoceSlot key={slot.id} slot={slot}>
            <AzioniSlot
              slot={slot}
              feedback={feedback}
              unavailable={unavailable}
              onSaved={saved}
            />
          </VoceSlot>
        ))}
      </Elenco>
    </Stack>
  );
}
