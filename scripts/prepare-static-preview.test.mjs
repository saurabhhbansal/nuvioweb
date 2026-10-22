import test from "node:test";
import assert from "node:assert/strict";
import { applyTmdbKey, validatePublicConfig } from "./prepare-static-preview.mjs";

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
