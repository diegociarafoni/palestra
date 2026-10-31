import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getActiveScheda } from "../../src/store/scheda";
import example from "../fixtures/scheda-esempio.json";

// Esempio letterale di scheda/SCHEMA.md § 1 (valido dal 2026-11-03 al 2026-11-30).
const december = {
  ...example,
  version: "2026-12",
  valid_from: "2026-12-01",
  valid_to: "2026-12-31",
};

async function insertScheda(
  s: typeof example,
  validTo: string | null = s.valid_to,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(
      s.version,
      s.valid_from,
      validTo,
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
    expect(await getActiveScheda(env.DB, "2026-11-02")).toBeNull();
    expect(await getActiveScheda(env.DB, "2027-01-01")).toBeNull();

    // L'esempio è valido per lo schema; `indirect_muscles` assente vale [].
    const [warmup, strength, cardio] = example.days[0]?.blocks ?? [];
    expect(await getActiveScheda(env.DB, "2026-11-30")).toEqual({
      ...example,
      days: [
        {
          id: "A",
          name: "Giorno A",
          blocks: [
            warmup,
            {
              type: "strength",
              exercises: [{ ...strength?.exercises[0], indirect_muscles: [] }],
            },
            cardio,
          ],
        },
      ],
    });
  });

  it("store: active scheda prefers latest start and open end", async () => {
    await insertScheda(december);
    // valid_to NULL nella colonna: scheda senza scadenza, iniziata dopo dicembre.
    await insertScheda(
      { ...december, version: "2027-01", valid_from: "2026-12-15" },
      null,
    );
    expect((await getActiveScheda(env.DB, "2026-12-10"))?.version).toBe(
      "2026-12",
    );
    expect((await getActiveScheda(env.DB, "2026-12-20"))?.version).toBe(
      "2027-01",
    );
    expect((await getActiveScheda(env.DB, "2027-06-01"))?.version).toBe(
      "2027-01",
    );
  });
});
