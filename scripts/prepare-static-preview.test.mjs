import test from "node:test";
import assert from "node:assert/strict";
import { applyReturnRelayUrl, applyTmdbKey, applyTrackerClientIds, validatePublicConfig } from "./prepare-static-preview.mjs";

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

test("the return relay address fills its line only as a bare https origin", () => {
  const props = "TMDB_API_KEY=\nNUVIO_EXTERNAL_RETURN_RELAY_URL=\n";
  assert.equal(applyReturnRelayUrl(props, ""), props);
  assert.equal(
    applyReturnRelayUrl(props, "https://nuvioweb-return-relay.example.workers.dev/\n"),
    props.replace("NUVIO_EXTERNAL_RETURN_RELAY_URL=", "NUVIO_EXTERNAL_RETURN_RELAY_URL=https://nuvioweb-return-relay.example.workers.dev")
  );
  for (const bad of ["http://relay.example", "https://relay.example/api", "https://relay.example?x", "https://u:p@relay.example", "relay.example", "https://relay.example\nTMDB_API_KEY=x"]) {
    assert.throws(() => applyReturnRelayUrl(props, bad), /bare https origin/, bad);
  }
  assert.throws(() => applyReturnRelayUrl("TMDB_API_KEY=\n", "https://relay.example"), /no NUVIO_EXTERNAL_RETURN_RELAY_URL/);
  assert.equal(validatePublicConfig(config({ ...publicValues, NUVIO_EXTERNAL_RETURN_RELAY_URL: "https://relay.example" })).NUVIO_EXTERNAL_RETURN_RELAY_URL, "https://relay.example");
  assert.throws(() => validatePublicConfig(config({ ...publicValues, NUVIO_EXTERNAL_RETURN_RELAY_URL: "http://relay.example" })), /bare https origin/);
});
