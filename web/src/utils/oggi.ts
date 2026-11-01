import { useSyncExternalStore } from "react";
import { todayInRome } from "./date";

// La pagina può restare aperta per giorni (scheda del telefono): oggi si rilegge quando la pagina
// torna visibile o riprende il fuoco.
function subscribeToReturn(onReturn: () => void): () => void {
  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("focus", onReturn);
  return () => {
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("focus", onReturn);
  };
}

/**
 * Data di oggi a Roma (`AAAA-MM-GG`) come stato esterno (una stringa, confrontata per valore): il
 * render resta puro.
 */
export function useToday(): string {
  return useSyncExternalStore(subscribeToReturn, todayInRome);
}
