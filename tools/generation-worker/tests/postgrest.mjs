const voidFunctions=new Set(["edge_begin_generation_stage","edge_recover_generation_jobs",
  "edge_mark_generation_published","edge_commit_generated_audio","edge_report_generation_readiness"]);
export function postgrestResponse(name,value){
  return voidFunctions.has(name)?new Response(null,{status:204}):Response.json(value);
}
