import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { DashboardSlot } from "../../../../src/domain/dashboard";
import { choosableDays, type Weekday } from "../../../../src/domain/planning";
import { patchSlot } from "../../api/client";
import { useScrittura } from "../../api/scrittura";
import { SessionError } from "../../api/session";
import { testi } from "../../testi";
import { formatDay } from "../../utils/date";

type SceltaGiornoProps = {
  slot: DashboardSlot;
  /** Giorni della settimana non disponibili nel modello: non si propongono. */
  unavailable: Weekday[];
  /** Quando parte il salvataggio del giorno. */
  onSaving: () => void;
  /** Dopo il giorno salvato, con il calendario già ricaricato. */
  onSaved: () => void;
};

/**
 * Giorno scelto di uno slot programmato, fra quelli ammessi: la finestra e il sabato e la
 * domenica della sua settimana, senza i giorni non disponibili (spec § 5). Si salva alla scelta.
 */
export function SceltaGiorno({
  slot,
  unavailable,
  onSaving,
  onSaved,
}: SceltaGiornoProps) {
  const mutation = useScrittura((date: string) => patchSlot(slot.id, { date }));
  // Durante l'invio il giorno appena scelto; poi quello del calendario ricaricato (o, se il
  // salvataggio fallisce, quello di prima).
  const value = mutation.isPending ? mutation.variables : (slot.date ?? "");
  return (
    <Stack spacing={1}>
      <TextField
        select
        label={testi.chooseDay.label}
        value={value}
        disabled={mutation.isPending}
        // Durante l'invio la scelta è bloccata e perde il focus: dopo, `onSaved` lo sposta.
        onChange={(event) => {
          onSaving();
          mutation.mutate(event.target.value, { onSuccess: onSaved });
        }}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ alignSelf: "flex-start", minWidth: "12em" }}
      >
        {slot.date === null && (
          <option value="" disabled>
            {testi.missing}
          </option>
        )}
        {choosableDays(slot, unavailable).map((day) => (
          <option key={day} value={day}>
            {formatDay(day)}
          </option>
        ))}
      </TextField>
      {mutation.isError && (
        <Alert severity="error">
          {mutation.error instanceof SessionError
            ? testi.state.session
            : testi.write.failed}
        </Alert>
      )}
    </Stack>
  );
}
