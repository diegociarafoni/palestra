import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { getScheda } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { StatoQuery } from "../../componenti/StatoQuery";
import { TestoMarkdown } from "../../componenti/TestoMarkdown";
import { testi } from "../../testi";
import { formatDate } from "../../utils/date";

/** Pagina Scheda: versione e periodo di validità della scheda attiva, poi il suo Markdown. */
export default function Scheda() {
  const query = useQuery({ queryKey: queryKeys.scheda, queryFn: getScheda });
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.scheda.title}
      </Typography>
      <StatoQuery query={query}>
        {(scheda) => (
          <>
            <Stack spacing={0.5}>
              <Typography>{testi.scheda.version(scheda.version)}</Typography>
              <Typography sx={{ color: "text.secondary" }}>
                {testi.scheda.validity(
                  formatDate(scheda.valid_from),
                  formatDate(scheda.valid_to),
                )}
              </Typography>
            </Stack>
            <TestoMarkdown>{scheda.md}</TestoMarkdown>
          </>
        )}
      </StatoQuery>
    </Stack>
  );
}
