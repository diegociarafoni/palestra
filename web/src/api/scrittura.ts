import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

/**
 * Scrittura verso l'API (`useMutation`): se riesce, calendario e settimane si ricaricano. La
 * scrittura resta in corso finché i nuovi dati non sono arrivati, così il pulsante esce dal
 * caricamento quando il calendario mostra già il risultato.
 */
export function useScrittura<T>(write: (variables: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allCalendars }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allWeeks }),
      ]),
  });
}
