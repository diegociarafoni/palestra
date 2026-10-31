import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ParseError } from "../../src/errors";
import { getActiveScheda } from "../../src/store/scheda";
import example from "../fixtures/scheda-esempio.json";

// Esempio letterale di scheda/SCHEMA.md § 1 (valido dal 2026-11-03 al 2026-11-30).
const december = {
  ...example,
  version: "2026-12",
  valid_from: "2026-12-01",
  valid_to: "2026-12-31",
};

async function insertScheda(s: typeof example): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(
      s.version,
      s.valid_from,
      s.valid_to,
      JSON.stringify(s),
      `# Scheda ${s.version}`,
    )
    .run();
}

describe("store scheda", () => {
  it("store: active scheda by date", async () => {
    await insertScheda(example);
    await insertScheda(december);

    expect((await getActiveScheda(env.DB, "2026-12-02"))?.version).toBe(
      "2026-12",
    );
    expect((await getActiveScheda(env.DB, "2026-11-03"))?.version).toBe(
      "2026-11",
    );
    expect(await getActiveScheda(env.DB, "2026-11-02")).toBeNull();
    expect(await getActiveScheda(env.DB, "2027-01-01")).toBeNull();

    // L'esempio di SCHEMA § 1 è valido per lo schema e torna identico.
    expect(await getActiveScheda(env.DB, "2026-11-30")).toEqual(example);
  });

  it.each(["indirect_muscles", "movement_pattern"])(
    "store: active scheda rejects strength exercise without %s",
    async (field) => {
      const scheda = structuredClone(example);
      const legPress = scheda.days[0]?.blocks[1]?.exercises[0];
      expect(legPress && Reflect.deleteProperty(legPress, field)).toBe(true);
      await insertScheda(scheda);
      const error = await getActiveScheda(env.DB, "2026-11-10").catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain("scheda (2026-11)");
    },
  );

  it("store: active scheda prefers latest start", async () => {
    await insertScheda(december);
    // Intervalli sovrapposti: vince l'inizio più recente.
    await insertScheda({
      ...december,
      version: "2027-01",
      valid_from: "2026-12-15",
      valid_to: "2027-01-31",
    });
    expect((await getActiveScheda(env.DB, "2026-12-10"))?.version).toBe(
      "2026-12",
    );
    expect((await getActiveScheda(env.DB, "2026-12-20"))?.version).toBe(
      "2027-01",
    );
  });

  it.each([
    { field: "version", value: "2026-10" },
    { field: "valid_from", value: "2026-11-01" },
    { field: "valid_to", value: "2026-12-01" },
  ])(
    "store: active scheda json must match its columns ($field)",
    async ({ field, value }) => {
      await env.DB.prepare(
        "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
        .bind(
          example.version,
          example.valid_from,
          example.valid_to,
          JSON.stringify({ ...example, [field]: value }),
          "# Scheda",
        )
        .run();
      const error = await getActiveScheda(env.DB, "2026-11-10").catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain("scheda (2026-11)");
    },
  );
});
