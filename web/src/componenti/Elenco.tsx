import Stack from "@mui/material/Stack";
import type { ReactNode } from "react";

type ElencoProps = { children: ReactNode };

/** Elenco (`ul`) di voci impilate, senza punti né rientro: le voci sono riquadri. */
export function Elenco({ children }: ElencoProps) {
  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {children}
    </Stack>
  );
}
