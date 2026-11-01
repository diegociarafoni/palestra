import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getExercises } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { GraficoE1rm } from "../../componenti/GraficoE1rm";
import { SelettoreMese } from "../../componenti/SelettoreMese";
import { StatoQuery } from "../../componenti/StatoQuery";
import { TabellaForza } from "../../componenti/TabellaForza";
import { testi } from "../../testi";
import { currentMonthInRome, previousMonth } from "../../utils/date";

/**
 * Pagina Esercizi: grafico dell'e1RM e tabella della forza del mese, dalle metriche del report.
 * Parte dal mese precedente a oggi (Europe/Rome), come il Report, perché le metriche di un mese
 * nascono con il report del 1° del mese dopo.
 */
export default function Esercizi() {
  const [month, setMonth] = useState(() => previousMonth(currentMonthInRome()));
  const query = useQuery({
    queryKey: queryKeys.exercises(month),
    queryFn: () => getExercises(month),
    // Nessuna metrica del mese: la pagina mostra "Nessun dato".
    select: (exercises) =>
      exercises !== null &&
      (exercises.strength_table.length > 0 || exercises.e1rm_series.length > 0)
        ? exercises
        : null,
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.nav.exercises}
      </Typography>
      <SelettoreMese month={month} onChange={setMonth} />
      <StatoQuery query={query}>
        {({ strength_table, e1rm_series }) => (
          <>
            <GraficoE1rm series={e1rm_series} />
            <TabellaForza rows={strength_table} />
          </>
        )}
      </StatoQuery>
    </Stack>
  );
}
