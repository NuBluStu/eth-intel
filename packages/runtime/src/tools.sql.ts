import duckdb from "duckdb";

const db = new duckdb.Database(process.env.DUCKDB_PATH || ":memory:");

export async function query(sqlText: string, params?: Record<string, any>) {
  // Only add LIMIT to SELECT statements without existing LIMIT
  const isSelect = /^\s*select\b/i.test(sqlText);
  const hasLimit = /\blimit\b/i.test(sqlText);
  const text = (isSelect && !hasLimit) ? `${sqlText}\nLIMIT 10000` : sqlText;
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
    const paramValues = params ? Object.values(params) : [];
    db.all(sqlText, ...paramValues, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}