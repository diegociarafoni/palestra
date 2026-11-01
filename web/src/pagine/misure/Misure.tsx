import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { getMeasures } from "../../api/client";
import { queryKeys } from "../../api/keys";
import { GraficoPeso } from "../../componenti/GraficoPeso";
import { StatoQuery } from "../../componenti/StatoQuery";
import { TabellaMisure } from "../../componenti/TabellaMisure";
import { testi } from "../../testi";

/** Pagina Misure: grafico del peso (solo misure in protocollo) e tabella di tutte le misure. */
export default function Misure() {
  const query = useQuery({
    queryKey: queryKeys.measures,
    queryFn: getMeasures,
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.measures.title}
      </Typography>
      <StatoQuery query={query}>
        {(measures) => (
          <>
            <GraficoPeso measures={measures} />
            <TabellaMisure measures={measures} />
          </>
        )}
      </StatoQuery>
    </Stack>
  );
}
