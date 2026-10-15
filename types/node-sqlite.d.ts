declare module "node:sqlite" {
  type SQLiteValue = string | number | bigint | Uint8Array | null;

  interface StatementSync {
    get(...values: SQLiteValue[]): unknown;
    run(...values: SQLiteValue[]): {
      changes: number | bigint;
      lastInsertRowid: number | bigint;
    };
  }

  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
