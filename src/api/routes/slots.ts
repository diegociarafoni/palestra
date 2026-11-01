import { Hono } from "hono";
import { validator } from "hono/validator";
import { SlotPatchBodySchema } from "../../domain/dashboard";
import { choosableDays, WeekTemplateSchema } from "../../domain/planning";
import { getProfile, updateSlotByUser } from "../../store/manual";
import { getSlot } from "../../store/planning";
import type { AppEnv } from "../app";

/**
 * `PATCH /api/slots/:id`: scelta dell'utente su uno slot programmato, con la riga `audit` che ha
 * per autore l'e-mail di Access.
 */
export const slotsRoute = new Hono<AppEnv>().patch(
  "/:id",
  validator("json", (value, c) => {
    const parsed = SlotPatchBodySchema.safeParse(value);
    return parsed.success ? parsed.data : c.json({ error: "bad_request" }, 400);
  }),
  async (c) => {
    const id = c.req.param("id");
    const change = c.req.valid("json");
    const slot = await getSlot(c.env.DB, id);
    if (slot === null) return c.json({ error: "not_found" }, 404);
    // Uno slot con la seduta è della sync, che sovrascriverebbe la scelta.
    if (
      slot.session_id !== null ||
      slot.status === "fatta" ||
      slot.status === "spostata"
    ) {
      return c.json({ error: "conflict" }, 409);
    }
    if ("date" in change) {
      const tpl = await getProfile(
        c.env.DB,
        "settimana_tipo",
        WeekTemplateSchema,
      );
      if (!choosableDays(slot, tpl?.unavailable ?? []).includes(change.date)) {
        return c.json({ error: "bad_request" }, 400);
      }
    }
    const saved = await updateSlotByUser(c.env.DB, id, change, c.get("email"));
    // Nel frattempo la sync ha abbinato una seduta allo slot.
    if (saved === null) return c.json({ error: "conflict" }, 409);
    return c.json(saved, 200);
  },
);
