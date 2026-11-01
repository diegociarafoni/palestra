import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { getWeek } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { Elenco } from "../../componenti/Elenco";
import { StatoQuery } from "../../componenti/StatoQuery";
import { VoceSlot } from "../../componenti/VoceSlot";
import { testi } from "../../testi";
import { todayInRome } from "../../utils/date";
import { TabellaSedute } from "./TabellaSedute";

/**
 * Pagina iniziale: la settimana di oggi (Europe/Rome), con gli slot programmati e, sotto, le
 * sedute svolte e il totale dei MOVEs.
 */
export default function Settimana() {
  // Oggi si legge una volta, all'apertura della pagina: il render resta puro.
  const [today] = useState(todayInRome);
  const query = useQuery({
    queryKey: queryKeys.week(today),
    queryFn: () => getWeek(today),
    // Né slot né sedute: la pagina mostra "Nessun dato".
    select: (week) =>
      week !== null && (week.slots.length > 0 || week.sessions.length > 0)
        ? week
        : null,
  });
  const slotsId = useId();
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.nav.week}
      </Typography>
      <StatoQuery query={query}>
        {({ slots, sessions, moves_total }) => (
          <>
            <Stack component="section" aria-labelledby={slotsId} spacing={1}>
              <Typography id={slotsId} variant="h6" component="h2">
                {testi.week.slotsTitle}
              </Typography>
              {slots.length === 0 ? (
                <Typography>{testi.state.empty}</Typography>
              ) : (
                <Elenco>
                  {slots.map((slot) => (
                    <VoceSlot key={slot.id} slot={slot} />
                  ))}
                </Elenco>
              )}
            </Stack>
            <TabellaSedute sessions={sessions} movesTotal={moves_total} />
          </>
        )}
      </StatoQuery>
    </Stack>
  );
}
