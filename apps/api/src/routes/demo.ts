import { JOB_SEARCH_INDEX } from '@talentmatch/shared';
import type { ApiInstance } from '../types.js';

export function registerDemoRoute(app: ApiInstance): void {
  app.get('/demo', {
    schema: { hide: true },
  }, (_request, reply) => reply
    .type('text/html; charset=utf-8')
    .send(demoPage.replaceAll('__JOB_SEARCH_INDEX__', JOB_SEARCH_INDEX)));
}

const demoPage = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TalentMatch — Interactive Demo</title>
  <style>
    :root { color-scheme: dark; --ink:#ecf3ee; --muted:#91a39a; --panel:#111a17; --line:#273a33; --mint:#66e3aa; --gold:#ffc66d; --red:#ff7d7d; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif; color:var(--ink); background:radial-gradient(circle at 10% 0,#193b31 0,transparent 32rem),#08100e; }
    button,input,textarea { font:inherit; }
    .shell { width:min(1180px,calc(100% - 32px)); margin:auto; padding:42px 0 64px; }
    header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:30px; }
    .eyebrow { color:var(--mint); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
    h1 { margin:5px 0 7px; font-size:clamp(32px,5vw,58px); line-height:1; letter-spacing:-.05em; }
    header p { max-width:650px; margin:0; color:var(--muted); font-size:16px; }
    .run { white-space:nowrap; padding:13px 20px; border:0; border-radius:999px; color:#072018; background:var(--mint); font-weight:850; cursor:pointer; box-shadow:0 10px 32px #36d49335; }
    .run:disabled,button:disabled { opacity:.45; cursor:wait; }
    .statusbar { display:flex; align-items:center; gap:10px; padding:11px 14px; margin-bottom:18px; border:1px solid var(--line); border-radius:12px; background:#0c1512cc; color:var(--muted); }
    .dot { width:9px; height:9px; border-radius:50%; background:var(--gold); box-shadow:0 0 14px currentColor; }
    .dot.ok { background:var(--mint); } .dot.bad { background:var(--red); }
    .grid { display:grid; grid-template-columns:1.05fr .95fr; gap:18px; }
    .card { border:1px solid var(--line); border-radius:18px; background:linear-gradient(145deg,#121d19ee,#0c1411ee); overflow:hidden; box-shadow:0 18px 70px #0005; }
    .cardhead { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:17px 19px; border-bottom:1px solid var(--line); }
    .cardhead h2 { margin:0; font-size:17px; }
    .step { display:inline-grid; place-items:center; width:26px; height:26px; margin-right:9px; border-radius:50%; background:#20362e; color:var(--mint); font-size:12px; }
    .body { padding:18px; }
    .fields { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    label { display:block; color:var(--muted); font-size:12px; font-weight:700; }
    label.wide { grid-column:1/-1; }
    input,textarea { width:100%; margin-top:5px; padding:10px 11px; color:var(--ink); border:1px solid #30463e; border-radius:9px; outline:none; background:#07100d; }
    input:focus,textarea:focus { border-color:var(--mint); }
    textarea { min-height:64px; resize:vertical; }
    .actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:15px; }
    button.small { padding:9px 13px; border:1px solid #385149; border-radius:9px; color:var(--ink); background:#172620; font-weight:750; cursor:pointer; }
    button.primary { border-color:#4fcf99; color:#062319; background:var(--mint); }
    .badge { padding:4px 8px; border:1px solid #365047; border-radius:999px; color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; }
    .badge.good { color:var(--mint); border-color:#3c8c6b; } .badge.warn { color:var(--gold); border-color:#8b6937; }
    .result { min-height:76px; margin-top:14px; padding:13px; border:1px dashed #31473f; border-radius:10px; color:var(--muted); background:#07100d; }
    .result strong { color:var(--ink); }
    .score { display:flex; align-items:center; gap:16px; }
    .scorebig { display:grid; place-items:center; width:72px; height:72px; flex:0 0 auto; border:7px solid var(--mint); border-radius:50%; color:var(--mint); font-size:22px; font-weight:900; }
    .timeline { grid-column:1/-1; }
    pre { max-height:250px; overflow:auto; margin:0; padding:15px 18px; color:#b9d5c8; background:#050b09; font:12px/1.55 ui-monospace,SFMono-Regular,monospace; }
    .hint { margin-top:12px; color:var(--muted); font-size:12px; }
    @media(max-width:820px) { header { flex-direction:column; } .grid { grid-template-columns:1fr; } .timeline { grid-column:auto; } .run { width:100%; } }
  </style>
</head>
<body>
<main class="shell">
  <header>
    <div><div class="eyebrow">Interactive backend showcase</div><h1>TalentMatch</h1><p>Publish a role, discover it through full-text search, apply as a candidate, and watch the asynchronous matching engine score the fit.</p></div>
    <button class="run" id="runAll">Run full demo →</button>
  </header>
  <div class="statusbar"><span class="dot" id="healthDot"></span><span id="healthText">Checking API dependencies…</span></div>
  <section class="grid">
    <article class="card">
      <div class="cardhead"><h2><span class="step">1</span>Employer creates a role</h2><span class="badge" id="jobBadge">Not created</span></div>
      <div class="body">
        <div class="fields">
          <label class="wide">Job title<input id="title" value="Senior Backend Engineer"></label>
          <label>City<input id="city" value="Vienna"></label>
          <label>Salary range<input id="salary" value="80000–105000 EUR" disabled></label>
          <label class="wide">Required skills<input id="jobSkills" value="TypeScript, Node.js, MongoDB"></label>
          <label class="wide">Description<textarea id="description">Build and operate dependable distributed backend services for a growing product.</textarea></label>
        </div>
        <div class="actions"><button class="small" id="createJob">Create draft</button><button class="small primary" id="publishJob" disabled>Publish job</button></div>
        <div class="result" id="jobResult">The job ID and lifecycle state will appear here.</div>
      </div>
    </article>
    <article class="card">
      <div class="cardhead"><h2><span class="step">2</span>Candidate discovers it</h2><span class="badge" id="cacheBadge">No query</span></div>
      <div class="body">
        <div class="fields"><label class="wide">Search keyword<input id="keyword" value="backend"></label></div>
        <div class="actions"><button class="small primary" id="searchJobs">Search published jobs</button><button class="small" id="searchAgain">Repeat for cache HIT</button></div>
        <div class="result" id="searchResult">Published jobs returned by OpenSearch will appear here.</div>
        <div class="hint">Indexing is asynchronous via the worker. Search reads index <strong>__JOB_SEARCH_INDEX__</strong> (for example <code>GET __JOB_SEARCH_INDEX__/_search</code> in Dev Tools).</div>
      </div>
    </article>
    <article class="card">
      <div class="cardhead"><h2><span class="step">3</span>Candidate applies</h2><span class="badge" id="applicationBadge">Not applied</span></div>
      <div class="body">
        <div class="fields">
          <label class="wide">Candidate skills<input id="candidateSkills" value="TypeScript, Node.js, MongoDB"></label>
          <label>Experience<input id="experience" type="number" value="5"></label>
          <label>Expected salary<input id="expectation" type="number" value="95000"></label>
        </div>
        <div class="actions"><button class="small primary" id="apply" disabled>Submit application</button><button class="small" id="replay" disabled>Replay same request</button></div>
        <div class="result" id="applicationResult">The idempotent application result will appear here.</div>
      </div>
    </article>
    <article class="card">
      <div class="cardhead"><h2><span class="step">4</span>Matching result</h2><span class="badge" id="scoreBadge">Waiting</span></div>
      <div class="body"><div class="result" id="scoreResult">The worker calculates the deterministic score asynchronously.</div><div class="actions"><button class="small" id="poll" disabled>Refresh score</button></div></div>
    </article>
    <article class="card timeline">
      <div class="cardhead"><h2>Live event log</h2><button class="small" id="clearLog">Clear</button></div>
      <pre id="log">Ready for demo.</pre>
    </article>
  </section>
</main>
<script>
  const state = { jobId:null, applicationId:null, applicationPayload:null, idempotencyKey:null, busy:false };
  const $ = (id) => document.getElementById(id);
  const actorSeed = Date.now().toString(36);
  const employerHeaders = { 'x-development-subject':'employer-demo-' + actorSeed, 'x-development-role':'employer' };
  const candidateHeaders = { 'x-development-subject':'candidate-demo-' + actorSeed, 'x-development-role':'candidate' };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function log(label, value) { const line='[' + new Date().toLocaleTimeString() + '] ' + label + (value===undefined?'':'\n' + JSON.stringify(value,null,2)); $('log').textContent=line+'\n\n'+$('log').textContent; }
  function badge(id,text,kind) { $(id).textContent=text; $(id).className='badge ' + (kind||''); }
  async function request(path, options) {
    const response=await fetch(path,options);
    const type=response.headers.get('content-type')||'';
    const data=type.includes('json')?await response.json():await response.text();
    if(!response.ok) throw new Error((data.error&&data.error.message)||('Request failed: '+response.status));
    return { data:data, status:response.status, headers:response.headers };
  }
  async function health() { try { const r=await request('/health/ready'); $('healthDot').className='dot ok'; $('healthText').textContent='API, MongoDB, Redis, and OpenSearch are ready'; log('Dependencies ready',r.data); } catch(error) { $('healthDot').className='dot bad'; $('healthText').textContent=error.message; } }
  function jobPayload() { return { title:$('title').value, description:$('description').value, city:$('city').value, remote:true, skills:$('jobSkills').value.split(',').map((x)=>x.trim()).filter(Boolean), salary:{min:80000,max:105000,currency:'EUR'} }; }
  async function createJob() { const r=await request('/v1/jobs',{method:'POST',headers:Object.assign({'content-type':'application/json'},employerHeaders),body:JSON.stringify(jobPayload())}); state.jobId=r.data.id; $('jobResult').innerHTML='<strong>'+r.data.title+'</strong><br>ID: '+r.data.id+'<br>Status: '+r.data.status; badge('jobBadge','Draft','warn'); $('publishJob').disabled=false; log('Draft created',r.data); return r; }
  async function publishJob() { if(!state.jobId) throw new Error('Create a job first'); const r=await request('/v1/jobs/'+state.jobId+'/publish',{method:'POST',headers:employerHeaders}); $('jobResult').innerHTML='<strong>'+r.data.title+'</strong><br>ID: '+r.data.id+'<br>Status: published'; badge('jobBadge','Published','good'); $('apply').disabled=false; log('Job published; indexing command queued',r.data); return r; }
  async function searchJobs() { const keyword=encodeURIComponent($('keyword').value); const r=await request('/v1/jobs/search?keyword='+keyword+'&city=vienna&limit=10'); const cache=r.headers.get('x-cache')||'unknown'; badge('cacheBadge',cache,cache==='HIT'?'good':'warn'); const items=r.data.items||[]; $('searchResult').innerHTML=items.length?'<strong>'+items.length+' job(s) found</strong><br>'+items.map((j)=>j.title+' · '+j.city+' · '+j.salary.min+'–'+j.salary.max+' '+j.salary.currency).join('<br>'):'No indexed jobs found yet. Wait a moment and search again.'; log('Search completed — cache '+cache,r.data); return r; }
  async function waitForSearchInIndex(maxAttempts) { const keyword=encodeURIComponent($('keyword').value); for (let attempt=0; attempt<maxAttempts; attempt++) { const r=await request('/v1/jobs/search?keyword='+keyword+'&city=vienna&limit=10'); const items=r.data.items||[]; if (state.jobId && items.some((job)=>job.id===state.jobId)) { const cache=r.headers.get('x-cache')||'unknown'; badge('cacheBadge',cache,cache==='HIT'?'good':'warn'); $('searchResult').innerHTML='<strong>'+items.length+' job(s) found</strong><br>'+items.map((j)=>j.title+' · '+j.city+' · '+j.salary.min+'–'+j.salary.max+' '+j.salary.currency).join('<br>'); log('Published job is searchable — cache '+cache,r.data); return r; } $('searchResult').textContent='Waiting for the worker to index this job (attempt '+(attempt+1)+')…'; await sleep(700); } throw new Error('Job was published but is not searchable yet. Ensure the worker container is running, then search again or run pnpm reindex:docker.'); }
  function candidatePayload() { return { skills:$('candidateSkills').value.split(',').map((x)=>x.trim()).filter(Boolean), experienceYears:Number($('experience').value), city:'Vienna', remote:true, salaryExpectation:Number($('expectation').value) }; }
  async function apply() { if(!state.jobId) throw new Error('Create and publish a job first'); state.applicationPayload=candidatePayload(); state.idempotencyKey=state.idempotencyKey||('demo-'+actorSeed+'-'+state.jobId); const r=await request('/v1/jobs/'+state.jobId+'/applications',{method:'POST',headers:Object.assign({'content-type':'application/json','idempotency-key':state.idempotencyKey},candidateHeaders),body:JSON.stringify(state.applicationPayload)}); state.applicationId=r.data.id; badge('applicationBadge',r.status===202?'Accepted':'Replayed',r.status===202?'good':'warn'); $('applicationResult').innerHTML='<strong>Application accepted</strong><br>ID: '+r.data.id+'<br>HTTP '+r.status+' · replayed: '+(r.headers.get('idempotent-replayed')||'false'); $('replay').disabled=false; $('poll').disabled=false; log('Application submitted',r.data); return r; }
  async function replay() { const r=await apply(); log('Idempotency replay confirmed — HTTP '+r.status); return r; }
  async function pollScore(waitForCompletion) { if(!state.applicationId) throw new Error('Submit an application first'); for(let attempt=0;attempt<(waitForCompletion?20:1);attempt++){ const r=await request('/v1/applications/'+state.applicationId,{headers:candidateHeaders}); badge('scoreBadge',r.data.status,r.data.status==='scored'?'good':'warn'); if(r.data.status==='scored'&&r.data.score){ const s=r.data.score; $('scoreResult').innerHTML='<div class="score"><div class="scorebig">'+s.score+'</div><div><strong>Match score</strong><br>Matched: '+(s.matchedSkills.join(', ')||'none')+'<br>Missing: '+(s.missingSkills.join(', ')||'none')+'<br>Skills '+s.breakdown.skills+' · Location '+s.breakdown.location+' · Salary '+s.breakdown.salary+'</div></div>'; log('Scoring completed',r.data); return r; } $('scoreResult').textContent='Scoring in progress… worker attempt '+(attempt+1); if(!waitForCompletion) return r; await sleep(700); } throw new Error('Scoring is taking longer than expected; use Refresh score.'); }
  async function guarded(action) { try { return await action(); } catch(error) { log('ERROR: '+error.message); alert(error.message); throw error; } }
  $('createJob').onclick=()=>guarded(createJob); $('publishJob').onclick=()=>guarded(publishJob); $('searchJobs').onclick=()=>guarded(searchJobs); $('searchAgain').onclick=()=>guarded(searchJobs); $('apply').onclick=()=>guarded(apply); $('replay').onclick=()=>guarded(replay); $('poll').onclick=()=>guarded(()=>pollScore(false)); $('clearLog').onclick=()=>{$('log').textContent='Log cleared.';};
  $('runAll').onclick=async()=>{ if(state.busy)return; state.busy=true; $('runAll').disabled=true; $('runAll').textContent='Demo running…'; try { await createJob(); await publishJob(); await waitForSearchInIndex(20); await searchJobs(); await apply(); await pollScore(true); $('runAll').textContent='Demo complete ✓'; } catch(error) { log('DEMO STOPPED: '+error.message); $('runAll').textContent='Try again'; $('runAll').disabled=false; } finally { state.busy=false; } };
  health();
</script>
</body>
</html>`;
