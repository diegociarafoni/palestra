import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { getReport } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { SelettoreMese } from "../../componenti/SelettoreMese";
import { StatoQuery } from "../../componenti/StatoQuery";
import { TestoMarkdown } from "../../componenti/TestoMarkdown";
import { testi } from "../../testi";
import { currentMonthInRome, previousMonth } from "../../utils/date";

/**
 * Pagina Report: parte dal mese precedente a oggi (Europe/Rome), perché il report di un mese si
 * genera il 1° del mese dopo. Report e, se c'è, revisione, entrambi dal Markdown.
 */
export default function Report() {
  const [month, setMonth] = useState(() => previousMonth(currentMonthInRome()));
  const query = useQuery({
    queryKey: queryKeys.report(month),
    queryFn: () => getReport(month),
  });
  const reportId = useId();
  const revisioneId = useId();
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.report.title}
      </Typography>
      <SelettoreMese month={month} onChange={setMonth} />
      <StatoQuery query={query}>
        {({ report, revisione }) => (
          <>
            {report !== null && (
              <Stack component="section" aria-labelledby={reportId}>
                <Typography id={reportId} variant="overline">
                  {testi.report.report}
                </Typography>
                <TestoMarkdown>{report}</TestoMarkdown>
              </Stack>
            )}
            {report !== null && revisione !== null && <Divider />}
            {revisione !== null && (
              <Stack component="section" aria-labelledby={revisioneId}>
                <Typography id={revisioneId} variant="overline">
                  {testi.report.revisione}
                </Typography>
                <TestoMarkdown>{revisione}</TestoMarkdown>
              </Stack>
            )}
          </>
        )}
      </StatoQuery>
    </Stack>
  );
}
