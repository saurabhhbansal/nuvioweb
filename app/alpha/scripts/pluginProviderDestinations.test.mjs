import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createProviderDestinationApproval } from "./pluginProviderDestinations.mjs";
import { executeGetStreamsPrototype } from "./pluginGetStreamsPrototype.mjs";

const code = 'module.exports.getStreams=async function(){await fetch("https://declared.example/start",{headers:{Accept:"text/plain"}});return [{url:"https://media.example/fixture.mp4"}];};';
const record = () => ({ id:"fixture", sourceSha256:createHash("sha256").update(code).digest("hex"), destinations:["https://declared.example/documented-path"] });

test("verified provider declaration approves exact destination once with no per-run prompt", async () => {
  const declaration = record();
  const approve = createProviderDestinationApproval([declaration]);
  declaration.destinations.push("https://injected.example");
  const approved = approve({id:"fixture",source:{code}});
  assert.deepEqual(approved,{ok:true,hosts:["declared.example"]});
  approved.hosts.push("injected.example");
  assert.deepEqual(approve({id:"fixture",source:{code}}).hosts,["declared.example"]);
  let calls=0;
  const result=await executeGetStreamsPrototype({descriptor:{id:"fixture",name:"Fixture",code,allowedHosts:["declared.example"]},approvedHosts:approve({id:"fixture",source:{code}}).hosts,
    headerPolicy:{"declared.example":["Accept"]},resolveHost:async()=>["93.184.216.34"],transport:async(_url,options)=>{calls++;assert.equal(options.credentials,"omit");return {status:200,body:"ok"};}});
  assert.equal(result.ok,true);assert.equal(result.groups[0].streams.length,1);assert.equal(calls,1);
});

test("changed code false caller hash wrong provider and malformed declarations cannot approve", () => {
  const approve=createProviderDestinationApproval([record()]);
  for(const request of [{id:"fixture",source:{code:code+" ",sha256:record().sourceSha256}},{id:"other",source:{code}},{id:"fixture",source:{code:42}},{}])
    assert.deepEqual(approve(request),{ok:false,error:"provider-declaration"});
  for(const destination of ["http://declared.example","https://user:secret@declared.example","https://127.0.0.1","https://[::1]","https://localhost","https://x.local","https://*.example","https://declared.example:444","https://declared.example/?secret=canary","https://declared.example/#fragment"])
    assert.throws(()=>createProviderDestinationApproval([{...record(),destinations:[destination]}]),/invalid provider destination/);
  for(const records of [[record(),record()],[{...record(),destinations:new Array(1)}],[{...record(),destinations:Array(21).fill("https://declared.example")}],new Array(1),null])
    assert.throws(()=>createProviderDestinationApproval(records),/invalid provider/);
});

test("declaration approval cannot authorize redirect hosts or private resolved addresses", async () => {
  const approve=createProviderDestinationApproval([record()]);
  for(const privateAddress of [false,true]) {
    let calls=0;
    const result=await executeGetStreamsPrototype({descriptor:{id:"fixture",name:"Fixture",code,allowedHosts:["declared.example"]},approvedHosts:approve({id:"fixture",source:{code}}).hosts,
      headerPolicy:{"declared.example":["Accept"]},resolveHost:async()=>[privateAddress?"127.0.0.1":"93.184.216.34"],transport:async()=>{calls++;return {status:302,headers:{location:"https://not-declared.example/redirect"},body:""};}});
    assert.equal(result.error,privateAddress?"private-address":"host");assert.equal(calls,privateAddress?0:1);
  }
});
