import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventIcon from "@mui/icons-material/Event";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import HelpOutlinedIcon from "@mui/icons-material/HelpOutlined";
import Chip from "@mui/material/Chip";
import type { ReactElement } from "react";
import type { SlotStatus } from "../../../src/domain/planning";
import { testi } from "../testi";

// Un'icona con il colore del tema per ogni stato. L'etichetta resta nel colore del testo
// (contrasto AA in chiaro e in scuro, anche dove il colore di stato non lo raggiunge): il
// significato lo porta il testo, icona e colore sono un segnale in più.
const icons: Record<SlotStatus, ReactElement> = {
  programmata: <EventIcon color="info" />,
  fatta: <CheckCircleIcon color="success" />,
  spostata: <EventRepeatIcon color="success" />,
  da_confermare: <HelpOutlinedIcon color="warning" />,
  saltata: <CancelIcon color="error" />,
};

type StatoSlotProps = { status: SlotStatus };

/** Stato di uno slot programmato: etichetta in italiano con icona colorata. */
export function StatoSlot({ status }: StatoSlotProps) {
  return (
    <Chip
      variant="outlined"
      icon={icons[status]}
      label={testi.slot.status[status]}
    />
  );
}
