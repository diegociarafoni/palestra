import Alert from "@mui/material/Alert";
import { Component, type ReactNode } from "react";
import { testi } from "../testi";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { failed: boolean };

/**
 * Confine d'errore di una pagina (docs/buone-pratiche-react.md § 9): un errore di render mostra
 * un messaggio in italiano al posto della pagina, senza spegnere la navigazione né le altre pagine.
 * Nessun log: il messaggio dell'errore potrebbe contenere dati.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <Alert severity="error">{testi.page.failed}</Alert>;
    }
    return this.props.children;
  }
}
