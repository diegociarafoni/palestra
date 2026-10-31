import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SessionError } from "../api/client";
import { testi } from "../testi";

type StatoQueryProps<T> = {
  query: UseQueryResult<T | null>;
  children: (data: T) => ReactNode;
};

/**
 * Stati di una query di pagina: caricamento (Skeleton), errore (messaggio e "Riprova", che rilancia
 * la query; per la sessione non valida un messaggio suo), vuoto ("Nessun dato": risposta `null`, cioè 404, o lista vuota) oppure i dati.
 */
export function StatoQuery<T>({ query, children }: StatoQueryProps<T>) {
  if (query.isPending) {
    return (
      <Stack role="status" aria-label={testi.state.loading} spacing={1}>
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={160} />
      </Stack>
    );
  }
  if (query.isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button
            color="inherit"
            loading={query.isFetching}
            onClick={() => query.refetch()}
          >
            {testi.state.retry}
          </Button>
        }
      >
        {query.error instanceof SessionError
          ? testi.state.session
          : testi.state.error}
      </Alert>
    );
  }
  const data = query.data;
  if (data == null || (Array.isArray(data) && data.length === 0)) {
    return <Typography>{testi.state.empty}</Typography>;
  }
  return children(data);
}
