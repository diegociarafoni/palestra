import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Elementi del Markdown resi con i componenti MUI. I titoli scendono di un livello (h1 → h2…):
// l'unico h1 della pagina resta il suo titolo. Le tabelle GFM (report) scorrono in orizzontale
// dentro un TableContainer sul telefono. Gli URL passano dal filtro di default di react-markdown.
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
  a: ({ href, children }) => <Link href={href}>{children}</Link>,
  table: ({ children }) => (
    <TableContainer component={Paper} variant="outlined" sx={{ my: 2 }}>
      <Table size="small">{children}</Table>
    </TableContainer>
  ),
  thead: ({ children }) => <TableHead>{children}</TableHead>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => <TableCell>{children}</TableCell>,
  td: ({ children }) => <TableCell>{children}</TableCell>,
};

const remarkPlugins = [remarkGfm];

type TestoMarkdownProps = { children: string };

/** Markdown della scheda o del report reso con la tipografia e le tabelle del tema. */
export function TestoMarkdown({ children }: TestoMarkdownProps) {
  return (
    <Markdown components={components} remarkPlugins={remarkPlugins}>
      {children}
    </Markdown>
  );
}
