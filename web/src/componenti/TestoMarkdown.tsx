import Typography from "@mui/material/Typography";
import Markdown, { type Components } from "react-markdown";

// Elementi del Markdown resi con i componenti MUI. I titoli scendono di un livello (h1 → h2…):
// l'unico h1 della pagina resta il suo titolo.
const components: Components = {
  h1: ({ children }) => (
    <Typography variant="h6" component="h2">
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: "bold" }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="subtitle2" component="h4">
      {children}
    </Typography>
  ),
  p: ({ children }) => <Typography sx={{ my: 1 }}>{children}</Typography>,
  li: ({ children }) => <Typography component="li">{children}</Typography>,
};

type TestoMarkdownProps = { children: string };

/** Markdown della scheda o del report reso con la tipografia del tema. */
export function TestoMarkdown({ children }: TestoMarkdownProps) {
  return <Markdown components={components}>{children}</Markdown>;
}
