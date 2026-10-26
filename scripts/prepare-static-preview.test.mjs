import test from "node:test";
import assert from "node:assert/strict";
import { applyTmdbKey, applyTrackerClientIds, validatePublicConfig } from "./prepare-static-preview.mjs";

const publicValues = {NUVIO_ENABLE_TRAKT_BRIDGE:"false",NUVIO_ENABLE_DEBRID_BRIDGE:"false",NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE:"false",NUVIO_SUPABASE_URL:"https://api.nuvio.tv",NUVIO_SUPABASE_ANON_KEY:"sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN",NUVIO_SUPABASE_FALLBACK_URL:""};
const config = (values) => `var values = ${JSON.stringify(values,null,2)};`;
test("rejects a missing/privileged key or alternate credential recipient before staging", () => {
  assert.deepEqual(validatePublicConfig(config(publicValues)),publicValues);
  assert.throws(()=>validatePublicConfig(""),/Missing/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,NUVIO_SUPABASE_ANON_KEY:"service-role-or-account-token"})),/publishable/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,NUVIO_SUPABASE_URL:"https://other.example.invalid"})),/primary/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,NUVIO_SUPABASE_FALLBACK_URL:"https://other.example.invalid"})),/Alternate/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,TRAKT_CLIENT_SECRET:"never-ship"})),/Unexpected/);
});


test("static preview refuses enabled, missing or malformed sidecar flags",()=>{
  for(const key of ["NUVIO_ENABLE_TRAKT_BRIDGE","NUVIO_ENABLE_DEBRID_BRIDGE","NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE"]) {
    for(const value of ["true",true,"FALSE","",undefined]) assert.throws(()=>validatePublicConfig(config({...publicValues,[key]:value})),/sidecars/);
  }
});

test("the Trakt sign-in helper is on only when the deploy asks for it, with a client id",()=>{
  const withBridge = {...publicValues,NUVIO_ENABLE_TRAKT_BRIDGE:"true",TRAKT_CLIENT_ID:"0123456789abcdef0123"};
  assert.equal(validatePublicConfig(config(withBridge),{traktBridge:true}).NUVIO_ENABLE_TRAKT_BRIDGE,"true");
  assert.throws(()=>validatePublicConfig(config(publicValues),{traktBridge:true}),/helper/);
  assert.throws(()=>validatePublicConfig(config({...withBridge,TRAKT_CLIENT_ID:""}),{traktBridge:true}),/TRAKT_CLIENT_ID/);
  assert.throws(()=>validatePublicConfig(config({...withBridge,NUVIO_ENABLE_DEBRID_BRIDGE:"true"}),{traktBridge:true}),/sidecars/);
  const props = "TRAKT_CLIENT_ID=\nNUVIO_ENABLE_TRAKT_BRIDGE=false\n";
  assert.equal(
    applyTrackerClientIds(props,{trakt:"0123456789abcdef0123"},{traktBridge:true}),
    "TRAKT_CLIENT_ID=0123456789abcdef0123\nNUVIO_ENABLE_TRAKT_BRIDGE=true\n"
  );
  assert.equal(applyTrackerClientIds(props,{trakt:"0123456789abcdef0123"}).includes("BRIDGE=false"),true);
  assert.throws(()=>applyTrackerClientIds(props,{},{traktBridge:true}),/client id/);
});

test("TMDB key comes from a private file and must look like a v3 key",()=>{
  const props = ["NUVIO_SUPABASE_URL=https://api.nuvio.tv","TMDB_API_KEY=","TRAKT_CLIENT_ID=",""].join("\n");
  const key = "0123456789abcdef0123456789ABCDEF";
  assert.equal(applyTmdbKey(props, ""), props);
  assert.equal(applyTmdbKey(props, `${key}\n`), props.replace("TMDB_API_KEY=", `TMDB_API_KEY=${key}`));
  assert.throws(()=>applyTmdbKey(props, "short"),/32-character/);
  assert.throws(()=>applyTmdbKey(props, `${key}\nTRAKT_CLIENT_ID=x`),/32-character/);
  assert.throws(()=>applyTmdbKey("NUVIO_SUPABASE_URL=x\n", key),/no TMDB_API_KEY/);
});

test("tracker client ids fill their lines, stay off when empty and reject anything that is not an id", () => {
  const props = "TMDB_API_KEY=\nTRAKT_CLIENT_ID=\nSIMKL_CLIENT_ID=\n";
  const trakt = "a".repeat(64);
  const simkl = "B1".repeat(32);
  assert.equal(applyTrackerClientIds(props, {}), props);
  assert.equal(applyTrackerClientIds(props, { trakt: "  " }), props);
  assert.equal(
    applyTrackerClientIds(props, { trakt: `${trakt}\n`, simkl }),
    `TMDB_API_KEY=\nTRAKT_CLIENT_ID=${trakt}\nSIMKL_CLIENT_ID=${simkl}\n`
  );
  for (const bad of ["short", "x".repeat(200), `${trakt}\nNUVIO_ENABLE_TRAKT_BRIDGE=true`, "id with spaces 12345"]) {
    assert.throws(() => applyTrackerClientIds(props, { trakt: bad }), /client id/);
  }
  const dashed = "0a1b2c3d-4e5f-6789-abcd-ef0123456789_x";
  assert.match(applyTrackerClientIds(props, { trakt: dashed }), new RegExp(`TRAKT_CLIENT_ID=${dashed}`));
  assert.throws(() => applyTrackerClientIds(props, { trakt: `"${trakt}"` }), /client id/);
  assert.throws(() => applyTrackerClientIds("TMDB_API_KEY=\n", { simkl }), /no SIMKL_CLIENT_ID line/);
});
