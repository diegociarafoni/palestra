import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getCalendar } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { SelettoreMese } from "../../componenti/SelettoreMese";
import { StatoQuery } from "../../componenti/StatoQuery";
import { testi } from "../../testi";
import { currentMonthInRome } from "../../utils/date";
import { MeseCalendario } from "./MeseCalendario";

/**
 * Pagina Calendario, in sola lettura (le scritture arrivano con il Task 12): slot del mese per
 * settimana, sedute extra e, per ogni seduta, il feedback se c'è. Parte dal mese di oggi a Roma.
 */
export default function Calendario() {
  const [month, setMonth] = useState(currentMonthInRome);
  const query = useQuery({
    queryKey: queryKeys.calendar(month),
    queryFn: () => getCalendar(month),
    // Né slot né sedute extra: "Nessun dato" (un feedback si mostra solo con la sua seduta).
    select: (calendar) =>
      calendar !== null &&
      (calendar.slots.length > 0 || calendar.extra.length > 0)
        ? calendar
        : null,
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.nav.calendar}
      </Typography>
      <SelettoreMese month={month} onChange={setMonth} />
      <StatoQuery query={query}>
        {(calendar) => <MeseCalendario calendar={calendar} />}
      </StatoQuery>
    </Stack>
  );
}
