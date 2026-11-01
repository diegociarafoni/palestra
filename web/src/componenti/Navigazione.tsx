import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import MonitorWeightIcon from "@mui/icons-material/MonitorWeight";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import { useTheme } from "@mui/material/styles";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useId, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { paths } from "../percorsi";
import { testi } from "../testi";

const mainPages = [
  { to: paths.week, label: testi.nav.week, icon: <ViewWeekIcon /> },
  {
    to: paths.calendar,
    label: testi.nav.calendar,
    icon: <CalendarMonthIcon />,
  },
  {
    to: paths.exercises,
    label: testi.nav.exercises,
    icon: <FitnessCenterIcon />,
  },
  {
    to: paths.measures,
    label: testi.nav.measures,
    icon: <MonitorWeightIcon />,
  },
];
const morePages = [
  { to: paths.scheda, label: testi.nav.scheda },
  { to: paths.report, label: testi.nav.report },
];
const MORE = "altro";

/**
 * Navigazione tra le sei pagine: sotto `md` una BottomNavigation (quattro pagine più "Altro", che
 * apre Scheda e Report), da `md` in su le Tabs. La pagina attiva ha `aria-current="page"` (NavLink)
 * e, sul telefono, è l'unica con l'etichetta scritta: lo stato non dipende dal solo colore.
 */
export function Navigazione() {
  const { pathname } = useLocation();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"), { noSsr: true });
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const menuOpen = moreAnchor !== null;
  const closeMenu = () => setMoreAnchor(null);

  if (wide) {
    const allPages = [...mainPages, ...morePages];
    const current = allPages.some((p) => p.to === pathname) ? pathname : false;
    return (
      <Box component="nav" aria-label={testi.nav.label}>
        <Tabs value={current} variant="scrollable" allowScrollButtonsMobile>
          {allPages.map((p) => (
            <Tab
              key={p.to}
              component={NavLink}
              to={p.to}
              value={p.to}
              label={p.label}
            />
          ))}
        </Tabs>
      </Box>
    );
  }

  const current = morePages.some((p) => p.to === pathname) ? MORE : pathname;
  return (
    <Paper
      component="nav"
      aria-label={testi.nav.label}
      elevation={3}
      sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: "appBar" }}
    >
      <BottomNavigation value={current}>
        {mainPages.map((p) => (
          <BottomNavigationAction
            key={p.to}
            component={NavLink}
            to={p.to}
            value={p.to}
            label={p.label}
            icon={p.icon}
          />
        ))}
        <BottomNavigationAction
          value={MORE}
          label={testi.nav.more}
          icon={<MoreHorizIcon />}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={(event) => setMoreAnchor(event.currentTarget)}
        />
      </BottomNavigation>
      <Menu
        id={menuId}
        anchorEl={moreAnchor}
        open={menuOpen}
        onClose={closeMenu}
        slotProps={{ list: { "aria-label": testi.nav.moreLabel } }}
      >
        {morePages.map((p) => (
          <MenuItem
            key={p.to}
            component={NavLink}
            to={p.to}
            selected={p.to === pathname}
            onClick={closeMenu}
          >
            {p.label}
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );
}
