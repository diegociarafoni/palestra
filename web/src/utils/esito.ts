import { useRef, useState } from "react";
import { useToday } from "./oggi";

/**
 * Esito di una scrittura, da mostrare in una regione `role="status"` sotto un titolo che resta
 * mentre i controlli cambiano o spariscono (il modulo di oggi, la settimana del calendario).
 * `start` svuota l'esito quando parte una scrittura nuova; `done` sposta il focus sul titolo
 * (`titleRef`, con `tabIndex={-1}`) e scrive l'esito, che vale solo nel giorno in cui è scritto.
 */
export function useEsito() {
  const today = useToday();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [esito, setEsito] = useState<{ date: string; text: string } | null>(
    null,
  );
  return {
    titleRef,
    text: esito?.date === today ? esito.text : "",
    start: () => setEsito(null),
    done: (text: string) => {
      titleRef.current?.focus();
      setEsito({ date: today, text });
    },
  };
}
