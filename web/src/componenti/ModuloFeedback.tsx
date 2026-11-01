import CheckIcon from "@mui/icons-material/Check";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { type FormEvent, useId, useState } from "react";
import { FeedbackBodySchema } from "../../../src/domain/dashboard";
import { type Feedback, FeedbackClassSchema } from "../../../src/domain/types";
import { putFeedback } from "../api/client";
import { useScrittura } from "../api/scrittura";
import { SessionError } from "../api/session";
import { testi } from "../testi";

type ModuloFeedbackProps = {
  /** Senza `title` il titolo lo mostra chi contiene il modulo, con l'id `titleId`. */
  title?: string;
  /** Giorno della seduta (`AAAA-MM-GG`). */
  date: string;
  /** Numero della seduta nel giorno (1 = la prima): con `date`, la chiave del feedback. */
  seq: number;
  /** Il feedback già salvato di questa seduta: il modulo parte dai suoi valori. */
  feedback: Feedback | undefined;
  /** `seq` di "Un'altra seduta oggi", che salva i valori del modulo per la seduta dopo. */
  anotherSeq?: number;
  /** Id del titolo, per chi contiene il modulo (il `Dialog` che lo nomina). */
  titleId?: string;
  /** Dopo un salvataggio riuscito, con il calendario già ricaricato. */
  onSaved?: () => void;
  /** Con questa funzione il modulo ha anche "Annulla". */
  onCancel?: () => void;
};

/**
 * "Come è andata?": classe della seduta, fastidio articolare (e dove), note, "Salva" e, con
 * `anotherSeq`, "Un'altra seduta oggi". Il corpo si valida con lo schema dell'API prima dell'invio.
 */
export function ModuloFeedback({
  title,
  date,
  seq,
  feedback,
  anotherSeq,
  titleId: givenTitleId,
  onSaved,
  onCancel,
}: ModuloFeedbackProps) {
  const ownTitleId = useId();
  const titleId = givenTitleId ?? ownTitleId;
  const classErrorId = useId();
  const [feedbackClass, setFeedbackClass] = useState<Feedback["class"] | null>(
    feedback?.class ?? null,
  );
  const [jointPain, setJointPain] = useState(feedback?.joint_pain ?? false);
  const [jointWhere, setJointWhere] = useState(feedback?.joint_where ?? "");
  const [notes, setNotes] = useState(feedback?.notes ?? "");
  // Gli errori si mostrano dal primo tentativo di salvare.
  const [attempted, setAttempted] = useState(false);
  const mutation = useScrittura(putFeedback);
  // Il pulsante in caricamento è quello della seduta che si sta salvando.
  const savingSeq = mutation.isPending ? mutation.variables.seq : null;

  const body = (target: number) =>
    FeedbackBodySchema.safeParse({
      date,
      seq: target,
      class: feedbackClass,
      joint_pain: jointPain,
      joint_where: jointWhere,
      notes,
    });
  const checked = body(seq);
  const classError =
    attempted &&
    !checked.success &&
    checked.error.issues.some((issue) => issue.path[0] === "class");

  function save(target: number) {
    const parsed = body(target);
    if (!parsed.success) {
      setAttempted(true);
      return;
    }
    mutation.mutate(parsed.data, { onSuccess: onSaved });
  }

  return (
    <Stack
      component="form"
      noValidate
      aria-labelledby={titleId}
      spacing={2}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save(seq);
      }}
    >
      {title !== undefined && (
        <Typography id={titleId} variant="h6" component="h2">
          {title}
        </Typography>
      )}
      <Stack spacing={0.5}>
        <ToggleButtonGroup
          exclusive
          orientation="vertical"
          fullWidth
          value={feedbackClass}
          // Una scelta non si toglie: un secondo tocco sulla stessa non la svuota.
          onChange={(_event, value) => {
            const parsed = FeedbackClassSchema.safeParse(value);
            if (parsed.success) setFeedbackClass(parsed.data);
          }}
          aria-label={testi.feedbackForm.classLabel}
          aria-describedby={classError ? classErrorId : undefined}
        >
          {FeedbackClassSchema.options.map((option) => (
            <ToggleButton key={option} value={option}>
              {/* Lo spazio fra emoji, testo e spunta è il `gap` del tema. */}
              <span aria-hidden="true">{testi.feedbackForm.emoji[option]}</span>
              {testi.feedback.classes[option]}
              {/* La scelta non si dice col solo colore (buone-pratiche-mui § 8). */}
              {option === feedbackClass && <CheckIcon aria-hidden="true" />}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {classError && (
          <FormHelperText id={classErrorId} error>
            {testi.feedbackForm.classMissing}
          </FormHelperText>
        )}
      </Stack>
      <FormControlLabel
        control={
          <Checkbox
            checked={jointPain}
            onChange={(event) => setJointPain(event.target.checked)}
          />
        }
        label={testi.feedbackForm.jointPain}
      />
      {jointPain && (
        <TextField
          label={testi.feedbackForm.jointWhere}
          value={jointWhere}
          onChange={(event) => setJointWhere(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
      )}
      <TextField
        label={testi.feedbackForm.notes}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { maxLength: 1000 } }}
      />
      {mutation.isError && (
        <Alert severity="error">
          {mutation.error instanceof SessionError
            ? testi.state.session
            : testi.write.failed}
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button
          type="submit"
          variant="contained"
          loading={savingSeq === seq}
          disabled={mutation.isPending}
        >
          {testi.feedbackForm.save}
        </Button>
        {anotherSeq !== undefined && (
          <Button
            variant="outlined"
            loading={savingSeq === anotherSeq}
            disabled={mutation.isPending}
            onClick={() => save(anotherSeq)}
          >
            {testi.feedbackForm.another}
          </Button>
        )}
        {onCancel && <Button onClick={onCancel}>{testi.write.cancel}</Button>}
      </Stack>
    </Stack>
  );
}
