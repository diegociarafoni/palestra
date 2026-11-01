import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId } from "react";
import type { CalendarResponse } from "../../../../src/domain/dashboard";
import { Elenco } from "../../componenti/Elenco";
import { testi } from "../../testi";
import { FeedbackSeduta } from "./FeedbackSeduta";
import { SettimanaSlot, type SlotWithFeedback } from "./SettimanaSlot";
import { VoceExtra } from "./VoceExtra";
import { VoceFeedback } from "./VoceFeedback";

// Chiave di un feedback e della sua seduta: giorno e numero della seduta nel giorno (`seq`), che il
// server calcola per ogni seduta (slot e extra) contando tutte le sedute del giorno.
const key = (date: string, seq: number): string => `${date} ${seq}`;

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

type MeseCalendarioProps = { month: string; calendar: CalendarResponse };

/**
 * Il mese del calendario: slot per settimana e sedute extra, ognuno con il suo feedback; poi i
 * feedback del mese che non hanno una seduta qui (salvati prima della sync, o di una seduta di
 * uno slot di un altro mese), per data.
 */
export function MeseCalendario({ month, calendar }: MeseCalendarioProps) {
  const { slots, extra, feedback } = calendar;
  const slotsId = useId();
  const extraId = useId();
  const othersId = useId();
  const byKey = new Map(feedback.map((f) => [key(f.date, f.seq), f]));
  const weeks = byWeek(
    slots.map((slot) => ({
      slot,
      feedback:
        slot.session === null
          ? undefined
          : byKey.get(key(slot.session.date, slot.session.seq)),
    })),
  );
  const extraFeedback = extra.map((e) => byKey.get(key(e.date, e.seq)));
  const shown = new Set([
    ...weeks.flatMap((w) => w.slots.map((s) => s.feedback)),
    ...extraFeedback,
  ]);
  const others = feedback.filter(
    (f) => f.date.startsWith(month) && !shown.has(f),
  );
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
      {others.length > 0 && (
        <Stack component="section" aria-labelledby={othersId} spacing={1}>
          <Typography id={othersId} variant="h6" component="h2">
            {testi.calendar.othersTitle}
          </Typography>
          <Elenco>
            {others.map((f) => (
              <VoceFeedback key={f.id} feedback={f} />
            ))}
          </Elenco>
        </Stack>
      )}
    </>
  );
}
