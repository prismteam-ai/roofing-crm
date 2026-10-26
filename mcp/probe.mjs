import { DuckDBInstance } from "@duckdb/node-api";
const inst = await DuckDBInstance.create(":memory:");
const c = await inst.connect();
await c.run("INSTALL httpfs; LOAD httpfs;");
for (const gw of ["https://ipfs.io","https://dweb.link","https://gateway.pinata.cloud"]) {
  try {
    const t=Date.now();
    const r = await c.runAndReadAll(`SELECT count(*) n, min(roof_age_years) FROM read_parquet('${gw}/ipfs/bafybeibm4mimuy4miseibpylvi6rgrkaedlsyb7vr7sbjgtj5jqukqzpta')`);
    console.log(gw, r.getRowObjects(), Date.now()-t,"ms");
  } catch(e){ console.log(gw,"FAIL",String(e.message).slice(0,200)); }
}
