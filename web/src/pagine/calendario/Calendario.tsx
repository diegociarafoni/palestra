import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Feedback } from "../../../../src/domain/types";
import { getCalendar } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { ModuloFeedback } from "../../componenti/ModuloFeedback";
import { SelettoreMese } from "../../componenti/SelettoreMese";
import { StatoQuery } from "../../componenti/StatoQuery";
import { testi } from "../../testi";
import { currentMonthInRome } from "../../utils/date";
import { useToday } from "../../utils/oggi";
import { MeseCalendario } from "./MeseCalendario";

/**
 * Pagina Calendario: nel mese di oggi, in cima, il modulo "Come è andata oggi?" (sull'ultimo
 * feedback di oggi, se c'è, con "Un'altra seduta oggi"); poi gli slot del mese per settimana, le
 * sedute extra e, per ogni seduta, il feedback da aggiungere o modificare; i feedback senza seduta
 * a parte. Parte dal mese di oggi a Roma.
 */
export default function Calendario() {
  const today = useToday();
  const [month, setMonth] = useState(currentMonthInRome);
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
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.nav.calendar}
      </Typography>
      <SelettoreMese month={month} onChange={setMonth} />
      {month === today.slice(0, 7) && todays.isSuccess && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {/* Un modulo nuovo per ogni feedback salvato: riparte dai suoi valori. */}
          <ModuloFeedback
            key={`${today} ${last?.seq} ${last?.updated_at}`}
            title={testi.feedbackForm.title}
            date={today}
            seq={last?.seq ?? 1}
            feedback={last ?? undefined}
            anotherSeq={last === null ? undefined : last.seq + 1}
          />
        </Paper>
      )}
      <StatoQuery query={query}>
        {(data) => <MeseCalendario month={month} calendar={data} />}
      </StatoQuery>
    </Stack>
  );
}
