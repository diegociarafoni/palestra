import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { testi } from "../testi";
import { formatMonth, nextMonth, previousMonth } from "../utils/date";

type SelettoreMeseProps = {
  month: string;
  onChange: (month: string) => void;
};

/** Mese mostrato (`AAAA-MM`) in parole, con i pulsanti per il mese precedente e successivo. */
export function SelettoreMese({ month, onChange }: SelettoreMeseProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <IconButton
        aria-label={testi.month.previous}
        onClick={() => onChange(previousMonth(month))}
      >
        <ChevronLeftIcon />
      </IconButton>
      <Typography
        aria-live="polite"
        sx={{ minWidth: "10em", textAlign: "center" }}
      >
        {formatMonth(month)}
      </Typography>
      <IconButton
        aria-label={testi.month.next}
        onClick={() => onChange(nextMonth(month))}
      >
        <ChevronRightIcon />
      </IconButton>
    </Stack>
  );
}
