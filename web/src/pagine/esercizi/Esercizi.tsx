import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { testi } from "../../testi";

/** Segnaposto: la pagina Esercizi arriva con la parte 2 del Task 10. */
export default function Esercizi() {
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.nav.exercises}
      </Typography>
      <Typography>{testi.state.empty}</Typography>
    </Stack>
  );
}
