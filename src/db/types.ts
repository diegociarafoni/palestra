/** Sottoinsieme del binding D1 usato dal codice: lo implementano il binding e il client HTTP. */
export type Db = Pick<D1Database, "prepare" | "batch">;
