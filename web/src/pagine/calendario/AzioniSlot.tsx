import Button from "@mui/material/Button";
import { useState } from "react";
import type { DashboardSlot } from "../../../../src/domain/dashboard";
import type { Weekday } from "../../../../src/domain/planning";
import type { Feedback } from "../../../../src/domain/types";
import { DialogoSlotSaltato } from "../../componenti/DialogoSlotSaltato";
import { testi } from "../../testi";
import { FeedbackModificabile } from "./FeedbackModificabile";
import { SceltaGiorno } from "./SceltaGiorno";

type AzioniSlotProps = {
  slot: DashboardSlot;
  /** Il feedback della seduta dello slot, se c'è. */
  feedback: Feedback | undefined;
  /** Giorni della settimana non disponibili nel modello. */
  unavailable: Weekday[];
  /** Dopo una scelta salvata, con il calendario già ricaricato: il testo dell'esito. */
  onSaved: (message: string) => void;
};

/**
 * Sotto uno slot del calendario: con la seduta, il suo feedback modificabile; senza, la scelta
 * del giorno se è programmato, la domanda "Saltata?" se è da confermare.
 */
export function AzioniSlot({
  slot,
  feedback,
  unavailable,
  onSaved,
}: AzioniSlotProps) {
  const [skipping, setSkipping] = useState(false);
  if (slot.session !== null) {
    return (
      <FeedbackModificabile
        date={slot.session.date}
        seq={slot.session.seq}
        feedback={feedback}
      />
    );
  }
  // Uno slot con la seduta è della sync: l'API rifiuta le scelte dell'utente (409).
  if (slot.session_id !== null) return null;
  if (slot.status === "da_confermare") {
    return (
      <>
        <Button
          sx={{ alignSelf: "flex-start" }}
          onClick={() => setSkipping(true)}
        >
          {testi.skip.question}
        </Button>
        <DialogoSlotSaltato
          slot={slot}
          open={skipping}
          onClose={() => setSkipping(false)}
          onSaved={() => onSaved(testi.skip.saved)}
        />
      </>
    );
  }
  if (slot.status === "programmata") {
    return (
      <SceltaGiorno
        slot={slot}
        unavailable={unavailable}
        onSaved={() => onSaved(testi.chooseDay.saved)}
      />
    );
  }
  return null;
}
