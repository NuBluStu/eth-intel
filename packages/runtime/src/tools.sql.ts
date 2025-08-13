import duckdb from "duckdb";

const db = new duckdb.Database(process.env.DUCKDB_PATH || ":memory:");

export async function query(sqlText: string, params?: Record<string, any>) {
  const text = /\blimit\b/i.test(sqlText) ? sqlText : `${sqlText}\nLIMIT 10000`;
  return exec(text, params);
}

export async function materialize(name: string, selectSql: string) {
  const safe = name.replace(/[^a-zA-Z0-9_]/g, "_");
  await exec(`CREATE OR REPLACE TABLE ${safe} AS ${selectSql}`);
  const rows = await exec(`SELECT COUNT(*) AS n FROM ${safe}`);
  return { name: safe, rows: rows[0]?.n ?? 0 };
}

function exec(sqlText: string, params?: Record<string, any>) {
  return new Promise<any[]>((resolve, reject) => {
    db.all(sqlText, Object.values(params || {}), (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}