import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId } from "react";
import type { CalendarResponse } from "../../../../src/domain/dashboard";
import type { Feedback } from "../../../../src/domain/types";
import { Elenco } from "../../componenti/Elenco";
import { testi } from "../../testi";
import { FeedbackSeduta } from "./FeedbackSeduta";
import { SettimanaSlot, type SlotWithFeedback } from "./SettimanaSlot";
import { VoceExtra } from "./VoceExtra";

/**
 * Feedback di ogni seduta, nello stesso ordine di `sedute`. Un feedback si riconosce da data e
 * `seq`, il numero della seduta nel giorno (src/store/manual.ts): la k-esima seduta di un giorno
 * ha il feedback con `seq` k. Nel giorno contano prima gli slot con quella data, poi le extra.
 */
function feedbackOf(
  sedute: { date: string | null }[],
  feedback: Feedback[],
): (Feedback | undefined)[] {
  return sedute.map(({ date }, index) => {
    if (date === null) return undefined;
    const seq =
      sedute.slice(0, index).filter((other) => other.date === date).length + 1;
    return feedback.find((f) => f.date === date && f.seq === seq);
  });
}

/** Slot raggruppati per settimana; l'API li dà in ordine di settimana e di numero. */
function byWeek(slots: SlotWithFeedback[]) {
  const weeks: { week: string; slots: SlotWithFeedback[] }[] = [];
  for (const item of slots) {
    const last = weeks.at(-1);
    if (last?.week === item.slot.week) last.slots.push(item);
    else weeks.push({ week: item.slot.week, slots: [item] });
  }
  return weeks;
}

type MeseCalendarioProps = { calendar: CalendarResponse };

/** Il mese del calendario: slot per settimana e sedute extra, ognuno con il suo feedback. */
export function MeseCalendario({ calendar }: MeseCalendarioProps) {
  const { slots, extra, feedback } = calendar;
  const slotsId = useId();
  const extraId = useId();
  const all = feedbackOf([...slots, ...extra], feedback);
  const weeks = byWeek(
    slots.map((slot, index) => ({ slot, feedback: all[index] })),
  );
  const extraFeedback = all.slice(slots.length);
  return (
    <>
      <Stack component="section" aria-labelledby={slotsId} spacing={2}>
        <Typography id={slotsId} variant="h6" component="h2">
          {testi.calendar.slotsTitle}
        </Typography>
        {weeks.length === 0 ? (
          <Typography>{testi.state.empty}</Typography>
        ) : (
          weeks.map(({ week, slots }) => (
            <SettimanaSlot key={week} week={week} slots={slots} />
          ))
        )}
      </Stack>
      <Stack component="section" aria-labelledby={extraId} spacing={1}>
        <Typography id={extraId} variant="h6" component="h2">
          {testi.calendar.extraTitle}
        </Typography>
        {extra.length === 0 ? (
          <Typography>{testi.state.empty}</Typography>
        ) : (
          <Elenco>
            {extra.map((session, index) => {
              const sessionFeedback = extraFeedback[index];
              return (
                // Il riassunto non ha id: data e posizione, in una lista che non si riordina.
                <VoceExtra key={`${session.date} ${index}`} session={session}>
                  {sessionFeedback && (
                    <FeedbackSeduta feedback={sessionFeedback} />
                  )}
                </VoceExtra>
              );
            })}
          </Elenco>
        )}
      </Stack>
    </>
  );
}
