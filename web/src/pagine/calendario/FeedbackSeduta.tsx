import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Feedback } from "../../../../src/domain/types";
import { testi } from "../../testi";

type FeedbackSedutaProps = { feedback: Feedback };

/** Feedback di una seduta: classe, fastidio articolare (e dove) e note, se ci sono. */
export function FeedbackSeduta({ feedback }: FeedbackSedutaProps) {
  return (
    <Stack
      spacing={0.5}
      sx={{ mt: 0.5, pt: 1, borderTop: 1, borderColor: "divider" }}
    >
      <Typography>
        {testi.feedback.class(testi.feedback.classes[feedback.class])}
      </Typography>
      <Typography>
        {feedback.joint_pain
          ? testi.feedback.jointPain(feedback.joint_where)
          : testi.feedback.noJointPain}
      </Typography>
      {feedback.notes ? (
        <Typography>{testi.feedback.notes(feedback.notes)}</Typography>
      ) : null}
    </Stack>
  );
}
