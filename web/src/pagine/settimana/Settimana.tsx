import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { testi } from "../../testi";

/** Segnaposto: la pagina Settimana arriva con il sotto-task 10.4. */
export default function Settimana() {
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {testi.nav.week}
      </Typography>
      <Typography>{testi.state.empty}</Typography>
    </Stack>
  );
}
