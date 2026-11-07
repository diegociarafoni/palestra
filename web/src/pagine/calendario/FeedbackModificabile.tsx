import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useId, useState } from "react";
import type { Feedback } from "../../../../src/domain/types";
import { ModuloFeedback } from "../../componenti/ModuloFeedback";
import { testi } from "../../testi";
import { formatDay } from "../../utils/date";
import { useToday } from "../../utils/oggi";
import { FeedbackSeduta } from "./FeedbackSeduta";

type FeedbackModificabileProps = {
  /** Giorno e numero nel giorno della seduta: la chiave del suo feedback. */
  date: string;
  seq: number;
  feedback: Feedback | undefined;
};

/**
 * Il feedback di una seduta del calendario, o "Senza feedback", con il pulsante che apre il modulo
 * per aggiungerlo o modificarlo (spec § 5: modificabile in qualsiasi momento).
 */
export function FeedbackModificabile({
  date,
  seq,
  feedback,
}: FeedbackModificabileProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const today = useToday();
  const theme = useTheme();
  const small = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const close = () => setOpen(false);
  return (
    <>
      {feedback ? (
        <FeedbackSeduta feedback={feedback} />
      ) : (
        <Stack sx={{ mt: 0.5, pt: 1, borderTop: 1, borderColor: "divider" }}>
          <Typography>{testi.feedbackForm.none}</Typography>
        </Stack>
      )}
      <Button sx={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>
        {feedback ? testi.feedbackForm.edit : testi.feedbackForm.add}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        fullScreen={small}
        aria-labelledby={titleId}
      >
        <DialogContent>
          <ModuloFeedback
            titleId={titleId}
            title={
              date === today
                ? testi.feedbackForm.title
                : testi.feedbackForm.titleOn(formatDay(date))
            }
            date={date}
            seq={seq}
            feedback={feedback}
            onSaved={close}
            onCancel={close}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
