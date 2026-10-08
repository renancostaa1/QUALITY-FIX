import { query, getPool } from '../src/db.js';

const views = [
  process.env.VIEW_CLIENTES || 'VW_CLIENTES',
  process.env.VIEW_PEDIDOS || 'VW_PEDIDOS',
  process.env.VIEW_PRODUTOS || 'VW_PRODUTOS',
];

try {
  const t0 = Date.now();
  await getPool();
  const [info] = await query(
    `SELECT @@SERVERNAME AS servidor, DB_NAME() AS banco, SUSER_SNAME() AS login, IS_SRVROLEMEMBER('sysadmin') AS sysadmin`,
  );
  console.log(`Conexão OK em ${Date.now() - t0} ms — servidor ${info.servidor}, banco ${info.banco}, login ${info.login}`);
  if (info.sysadmin === 1) {
    console.warn('ATENÇÃO: o login é sysadmin. Use um login somente leitura (SELECT nas 3 views).');
  }
  for (const v of views) {
    try {
      const cols = await query(`SELECT TOP 1 * FROM dbo.${v}`);
      console.log(`  ${v}: OK (${cols.length ? 'com dados' : 'vazia'})`);
    } catch (e) {
      console.log(`  ${v}: ERRO — ${e.message}`);
    }
  }
  process.exit(0);
} catch (e) {
  console.error(`Falha na conexão: ${e.message}`);
  process.exit(1);
}
