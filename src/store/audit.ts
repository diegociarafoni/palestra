import type { D1PreparedStatement } from "@cloudflare/workers-types";
import type { Db } from "../db/types";

export type AuditAction = "insert" | "update" | "delete";

/** Istruzione della riga `audit`: condivisa da writeAudit e dalle scritture manuali in batch. */
export function auditStatement(
  db: Db,
  actor: string,
  table: string,
  rowKey: string,
  action: AuditAction,
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO audit (at, actor, table_name, row_key, action) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(new Date().toISOString(), actor, table, rowKey, action);
}

/** Registra una scrittura manuale (chi, tabella, chiave, azione, quando). */
export async function writeAudit(
  db: Db,
  actor: string,
  table: string,
  rowKey: string,
  action: AuditAction,
): Promise<void> {
  await auditStatement(db, actor, table, rowKey, action).run();
}
