import sql from 'mssql';

let poolPromise;

export function getPool() {
  if (!poolPromise) {
    const { DB_CLIENT, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL, DB_CONNECT_TIMEOUT_MS } = process.env;
    if (DB_CLIENT && DB_CLIENT !== 'mssql') throw new Error(`DB_CLIENT=${DB_CLIENT} não suportado (use mssql)`);
    for (const [k, v] of Object.entries({ DB_HOST, DB_NAME, DB_USER, DB_PASSWORD })) {
      if (!v) throw new Error(`${k} está vazio — preencha o .env`);
    }
    poolPromise = new sql.ConnectionPool({
      server: DB_HOST,
      port: Number(DB_PORT) || 1433,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
      options: { encrypt: DB_SSL === 'true', trustServerCertificate: true },
      connectionTimeout: Number(DB_CONNECT_TIMEOUT_MS) || 10000,
      requestTimeout: 120000,
      pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
    })
      .connect()
      .catch((e) => {
        poolPromise = undefined;
        throw e;
      });
  }
  return poolPromise;
}

// Só leitura: executa apenas SELECT, sem travar o ERP (READ UNCOMMITTED).
export async function query(text, params = {}) {
  const pool = await getPool();
  const req = pool.request();
  for (const [name, [type, value]] of Object.entries(params)) req.input(name, type, value);
  const result = await req.query(`SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n${text}`);
  return result.recordset;
}

export { sql };
