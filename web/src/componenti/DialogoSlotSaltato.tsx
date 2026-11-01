import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useId, useState } from "react";
import { flushSync } from "react-dom";
import {
  type SkipReason,
  SkipReasonSchema,
  type SlotPatchBody,
} from "../../../src/domain/dashboard";
import type { PlannedSlot } from "../../../src/domain/planning";
import { patchSlot } from "../api/client";
import { useScrittura } from "../api/scrittura";
import { SessionError } from "../api/session";
import { testi } from "../testi";

type DialogoSlotSaltatoProps = {
  slot: PlannedSlot;
  open: boolean;
  onClose: () => void;
  /** Dopo la conferma salvata, a dialogo chiuso e con il calendario già ricaricato. */
  onSaved: () => void;
};

/**
 * Conferma che uno slot da confermare è saltato, con il motivo facoltativo (lavoro, stanchezza,
 * fastidio, altro). A tutto schermo sotto `sm`.
 */
export function DialogoSlotSaltato({
  slot,
  open,
  onClose,
  onSaved,
}: DialogoSlotSaltatoProps) {
  const titleId = useId();
  const reasonsId = useId();
  const theme = useTheme();
  const small = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const [reason, setReason] = useState<SkipReason | null>(null);
  const mutation = useScrittura((body: SlotPatchBody) =>
    patchSlot(slot.id, body),
  );
  // Chiuso, il dialogo dimentica motivo ed errore: riaperto riparte da capo.
  function close() {
    setReason(null);
    mutation.reset();
    onClose();
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      fullScreen={small}
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>
        {testi.skip.title(slot.scheda_day)}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <FormControl>
            <FormLabel id={reasonsId}>{testi.skip.reasonLabel}</FormLabel>
            <RadioGroup
              aria-labelledby={reasonsId}
              value={reason ?? ""}
              onChange={(event) => {
                const parsed = SkipReasonSchema.safeParse(event.target.value);
                if (parsed.success) setReason(parsed.data);
              }}
            >
              {SkipReasonSchema.options.map((option) => (
                <FormControlLabel
                  key={option}
                  value={option}
                  control={<Radio />}
                  label={testi.skip.reasons[option]}
                />
              ))}
            </RadioGroup>
          </FormControl>
          {mutation.isError && (
            <Alert severity="error">
              {mutation.error instanceof SessionError
                ? testi.state.session
                : testi.write.failed}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{testi.write.cancel}</Button>
        <Button
          variant="contained"
          loading={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              { status: "saltata", reason },
              {
                onSuccess: () => {
                  // Chiuso subito, prima che il calendario nuovo tolga "Saltata?": il dialogo
                  // riporta il focus al pulsante, poi `onSaved` lo sposta dove resta.
                  flushSync(close);
                  onSaved();
                },
              },
            )
          }
        >
          {testi.skip.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
