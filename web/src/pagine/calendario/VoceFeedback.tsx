import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Feedback } from "../../../../src/domain/types";
import { testi } from "../../testi";
import { formatDay } from "../../utils/date";
import { FeedbackSeduta } from "./FeedbackSeduta";

type VoceFeedbackProps = { feedback: Feedback };

/** Un feedback senza seduta mostrata (voce di `Elenco`): il suo giorno e il feedback. */
export function VoceFeedback({ feedback }: VoceFeedbackProps) {
  return (
    <Paper component="li" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={0.5}>
        <Typography>{testi.slot.date(formatDay(feedback.date))}</Typography>
        <FeedbackSeduta feedback={feedback} />
      </Stack>
    </Paper>
  );
}
