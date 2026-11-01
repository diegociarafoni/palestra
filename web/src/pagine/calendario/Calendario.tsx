import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import type { Feedback } from "../../../../src/domain/types";
import { getCalendar } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { ModuloFeedback } from "../../componenti/ModuloFeedback";
import { SelettoreMese } from "../../componenti/SelettoreMese";
import { StatoQuery } from "../../componenti/StatoQuery";
import { testi } from "../../testi";
import { useToday } from "../../utils/oggi";
import { MeseCalendario } from "./MeseCalendario";

/**
 * Pagina Calendario: nel mese di oggi, in cima, il modulo "Come è andata oggi?" (sull'ultimo
 * feedback di oggi, se c'è, con "Un'altra seduta oggi"); poi gli slot del mese per settimana, le
 * sedute extra e, per ogni seduta, il feedback da aggiungere o modificare; i feedback senza seduta
 * a parte. Mostra il mese di oggi a Roma, che segue il giorno nuovo, finché l'utente non ne
 * sceglie un altro.
 */
export default function Calendario() {
  const today = useToday();
  // Solo il mese scelto dall'utente: senza scelta, quello di oggi (anche dopo la mezzanotte).
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const month = chosenMonth ?? today.slice(0, 7);
  const calendar = {
    queryKey: queryKeys.calendar(month),
    queryFn: () => getCalendar(month),
  };
  const query = useQuery({
    ...calendar,
    // Né slot né sedute extra né feedback: la pagina mostra "Nessun dato".
    select: (data) =>
      data !== null &&
      (data.slots.length > 0 ||
        data.extra.length > 0 ||
        data.feedback.length > 0)
        ? data
        : null,
  });
  // Stessa richiesta: l'ultimo feedback di oggi (`seq` più alto), per il modulo.
  const todays = useQuery({
    ...calendar,
    select: (data) =>
      data?.feedback
        .filter((f) => f.date === today)
        .reduce<Feedback | null>(
          (last, f) => (last === null || f.seq > last.seq ? f : last),
          null,
        ) ?? null,
  });
  const last = todays.data ?? null;
  // Il titolo del modulo di oggi sta fuori dal modulo, che si rimonta dopo ogni salvataggio: il
  // focus ci torna e l'esito si annuncia (il pulsante premuto sparisce con il modulo vecchio).
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState("");
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.nav.calendar}
      </Typography>
      <SelettoreMese month={month} onChange={setChosenMonth} />
      {month === today.slice(0, 7) && todays.isSuccess && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              variant="h6"
              component="h2"
            >
              {testi.feedbackForm.title}
            </Typography>
            {/* Un modulo nuovo per ogni feedback salvato: riparte dai suoi valori. */}
            <ModuloFeedback
              key={`${today} ${last?.seq} ${last?.updated_at}`}
              titleId={titleId}
              date={today}
              seq={last?.seq ?? 1}
              feedback={last ?? undefined}
              anotherSeq={last === null ? undefined : last.seq + 1}
              onSaved={() => {
                titleRef.current?.focus();
                setStatus(testi.feedbackForm.saved);
              }}
            />
            <Typography role="status">{status}</Typography>
          </Stack>
        </Paper>
      )}
      <StatoQuery query={query}>
        {(data) => <MeseCalendario month={month} calendar={data} />}
      </StatoQuery>
    </Stack>
  );
}
