import { TransientError } from "../errors";
import { type R2Object, r2Request } from "./put-object";

/** Scarica un oggetto dal bucket R2 (giurisdizione UE) con una sola GET firmata. */
export async function getObject(opts: R2Object): Promise<Uint8Array> {
  const response = await r2Request({ ...opts, method: "GET" });
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new TransientError("R2: download interrotto (rete)", {
      cause: error,
    });
  }
}
