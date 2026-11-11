import { Html5Qrcode } from "html5-qrcode";

const app=document.querySelector("#app");
let me=null, page="dashboard", events=[], scanner=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(url,options={}) {
  const res=await fetch("/api"+url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||"Ocorreu um erro.");
  return data;
}
function notice(msg,type="notice"){return `<div class="notice ${type}">${esc(msg)}</div>`}
function shell(content,title="Painel") {
  app.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand">Convite<span>Único</span></div>
  <button class="nav ${page==="dashboard"?"active":""}" data-page="dashboard">Visão geral</button>
  <button class="nav ${page==="events"?"active":""}" data-page="events">Eventos</button>
  <button class="nav ${page==="invitations"?"active":""}" data-page="invitations">Convites</button>
  <button class="nav ${page==="scanner"?"active":""}" data-page="scanner">Leitor QR</button>
  ${me.role==="admin"?`<button class="nav ${page==="reports"?"active":""}" data-page="reports">Relatórios</button><button class="nav ${page==="users"?"active":""}" data-page="users">Utilizadores</button>`:""}
  <div class="side-bottom"><div class="small muted" style="padding:10px 12px">${esc(me.name)} · ${me.role==="admin"?"Administrador":"Operador"}</div><button class="nav" id="logout">Terminar sessão</button></div></aside>
  <main class="main"><div class="top"><div><div class="eyebrow">Gestão de acessos</div><h1>${esc(title)}</h1></div><div class="small muted">Convite Único</div></div>${content}</main></div>`;
  app.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  document.querySelector("#logout").onclick=async()=>{await api("/auth/logout",{method:"POST"});me=null;renderLogin();};
}
function renderLogin(){
 app.innerHTML=`<section class="panel login"><div class="brand">Convite<span>Único</span></div><h1>Bem-vindo</h1><p class="muted">Entre para gerir ou validar convites.</p><form id="login"><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="username"></div><div class="field"><label>Palavra-passe</label><input name="password" type="password" required autocomplete="current-password"></div><div id="err"></div><button style="width:100%">Entrar</button></form></section>`;
 document.querySelector("#login").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const r=await api("/auth/login",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});me=r.user;navigate("dashboard");}catch(err){document.querySelector("#err").innerHTML=notice(err.message,"error");}};
}
async function navigate(p){if(scanner){try{await scanner.stop();}catch{}scanner=null;}page=p; if(p==="dashboard")return dashboard();if(p==="events")return showEvents();if(p==="invitations")return showInvitations();if(p==="scanner")return showScanner();if(p==="reports")return showReports();if(p==="users")return showUsers();}
async function dashboard(){
 const d=await api("/dashboard");
 shell(`<div class="cards">${[["Eventos",d.events],["Convites emitidos",d.total],["Entradas validadas",d.used],["Por utilizar",d.unused]].map(([l,v])=>`<div class="card"><div class="muted small">${l}</div><div class="metric">${v}</div></div>`).join("")}</div><div class="panel"><h2>Comece por aqui</h2><p class="muted">Crie um evento, emita convites individuais e utilize o leitor QR para validar cada entrada uma única vez.</p><div class="actions"><button id="go-events">Gerir eventos</button><button class="secondary" id="go-scan">Abrir leitor</button></div></div>`,"Visão geral");
 document.querySelector("#go-events").onclick=()=>navigate("events");document.querySelector("#go-scan").onclick=()=>navigate("scanner");
}
async function showEvents(){
 events=await api("/events");
 const rows=events.map(e=>`<tr><td><b>${esc(e.name)}</b><div class="small muted">${esc(e.venue||"Local não indicado")}</div></td><td>${esc(e.event_date||"—")}</td><td>${e.total||0}</td><td>${e.used||0}</td><td><span class="pill ${e.status==="active"?"unused":"revoked"}">${e.status==="active"?"Activo":"Encerrado"}</span></td><td><div class="actions"><button class="secondary" data-issue="${e.id}">Emitir</button>${e.status==="active"&&me.role==="admin"?`<button class="danger" data-close="${e.id}">Encerrar</button>`:""}</div></td></tr>`).join("");
 shell(`${me.role==="admin"?`<div class="panel"><h2>Criar evento</h2><form id="event-form"><div class="grid2"><div class="field"><label>Nome do evento *</label><input name="name" required maxlength="120" placeholder="Ex.: Conferência anual"></div><div class="field"><label>Local</label><input name="venue" placeholder="Local do evento"></div><div class="field"><label>Data</label><input name="event_date" type="datetime-local"></div><div class="field"><label>Capacidade (opcional)</label><input name="capacity" type="number" min="1" placeholder="Sem limite definido"></div></div><button>Criar evento</button><div id="event-msg"></div></form></div>`:""}<div class="panel"><h2>Eventos registados</h2><div class="table-wrap"><table><thead><tr><th>Evento</th><th>Data</th><th>Emitidos</th><th>Utilizados</th><th>Estado</th><th>Acções</th></tr></thead><tbody>${rows||`<tr><td colspan="6" class="empty">Ainda não existem eventos.</td></tr>`}</tbody></table></div></div>`,"Eventos");
 const form=document.querySelector("#event-form");if(form)form.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form));try{await api("/events",{method:"POST",body:JSON.stringify(d)});showEvents();}catch(err){document.querySelector("#event-msg").innerHTML=notice(err.message,"error");}};
 document.querySelectorAll("[data-issue]").forEach(b=>b.onclick=()=>issueInvites(b.dataset.issue));
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=async()=>{if(confirm("Encerrar este evento? Novas entradas serão recusadas.")){await api(`/events/${b.dataset.close}/close`,{method:"PATCH"});showEvents();}});
}
async function issueInvites(id){
 const q=prompt("Quantos convites pretende emitir? (1 a 500)","1");if(q===null)return;
 const quantity=Number(q);if(!Number.isInteger(quantity)||quantity<1||quantity>500)return alert("Indique uma quantidade entre 1 e 500.");
 try{const r=await api(`/events/${id}/invitations`,{method:"POST",body:JSON.stringify({quantity})});alert(`${r.ids.length} convite(s) criado(s). Pode descarregá-los na página Convites.`);navigate("invitations");}catch(e){alert(e.message);}
}
async function showInvitations(){
 events=await api("/events");const rows=await api("/invitations");
 shell(`<div class="panel"><div class="toolbar"><input id="search" class="search" placeholder="Pesquisar convidado ou número…" style="max-width:300px"><select id="event-filter" class="search" style="max-width:240px"><option value="">Todos os eventos</option>${events.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div><div id="inv-table"></div></div>`,"Convites");
 const draw=(list)=>{document.querySelector("#inv-table").innerHTML=`<div class="table-wrap"><table><thead><tr><th>#</th><th>Convidado</th><th>Evento</th><th>Estado</th><th>Utilizado em</th><th>Ficheiro</th></tr></thead><tbody>${list.map(i=>`<tr><td>${i.id}</td><td>${esc(i.guest_name||"Convidado")}</td><td>${esc(i.event_name)}</td><td><span class="pill ${i.status}">${i.status==="used"?"Utilizado":i.status==="unused"?"Disponível":"Revogado"}</span></td><td>${esc(i.used_at||"—")}</td><td><div class="actions"><a href="/api/invitations/${i.id}/pdf">PDF</a><a href="/api/invitations/${i.id}/jpg">JPG</a></div></td></tr>`).join("")||`<tr><td colspan="6" class="empty">Nenhum convite encontrado.</td></tr>`}</tbody></table></div>`;};
 draw(rows);const filter=async()=>{const params=new URLSearchParams();if(document.querySelector("#event-filter").value)params.set("event",document.querySelector("#event-filter").value);if(document.querySelector("#search").value)params.set("search",document.querySelector("#search").value);draw(await api(`/invitations?${params}`));};
 document.querySelector("#search").oninput=filter;document.querySelector("#event-filter").onchange=filter;
}
async function showScanner(){
 shell(`<div class="scanner"><div class="panel"><h2>Validar convite</h2><p class="muted">Aponte a câmara para o QR Code. A primeira leitura válida autoriza a entrada; qualquer leitura posterior do mesmo código será recusada.</p><div id="reader" style="width:100%;max-width:520px;margin:auto"></div><div class="field" style="margin-top:18px"><label>Ou introduza o código/token manualmente</label><input id="manual-token" placeholder="Cole o código do convite"></div><div class="actions"><button id="manual-check">Validar código</button><button class="secondary" id="start-camera">Iniciar câmara</button></div><div id="scan-output"></div></div></div>`,"Leitor QR");
 document.querySelector("#manual-check").onclick=()=>scan(document.querySelector("#manual-token").value);
 const start=async()=>{try{if(!scanner)scanner=new Html5Qrcode("reader");const cams=await Html5Qrcode.getCameras();if(!cams.length)throw new Error("Não foi encontrada nenhuma câmara.");await scanner.start(cams[0].id,{fps:10,qrbox:{width:250,height:250}},decoded=>{scanner.pause(true);scan(decoded);},()=>{});}catch(e){document.querySelector("#scan-output").innerHTML=notice(e.message,"error");}};
 document.querySelector("#start-camera").onclick=start;start();
}
async function scan(raw){
 const token=String(raw||"").trim();if(!token)return;
 try{const result=await api("/scan",{method:"POST",body:JSON.stringify({token})});const el=document.querySelector("#scan-output");el.innerHTML=`<div class="scan-result ${result.result}"><b>${esc(result.message)}</b>${result.guest?`<p>Convidado: ${esc(result.guest)}</p>`:""}${result.event?`<p>Evento: ${esc(result.event)}</p>`:""}${result.used_at?`<p>Utilizado em: ${esc(result.used_at)}</p>`:""}</div>`;document.querySelector("#manual-token").value="";if(scanner){setTimeout(()=>{try{scanner.resume();}catch{}},2500);}}catch(e){document.querySelector("#scan-output").innerHTML=notice(e.message,"error");if(scanner)setTimeout(()=>{try{scanner.resume();}catch{}},2500);}
}
async function showReports(){
 const r=await api("/reports");
 shell(`<div class="toolbar"><a href="/api/reports.csv"><button class="secondary">Exportar CSV</button></a></div><div class="panel"><h2>Resumo por evento</h2><div class="table-wrap"><table><thead><tr><th>Evento</th><th>Emitidos</th><th>Utilizados</th><th>Disponíveis</th><th>Revogados</th><th>Taxa de entrada</th></tr></thead><tbody>${r.summary.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.total||0}</td><td>${x.used||0}</td><td>${x.unused||0}</td><td>${x.revoked||0}</td><td>${x.total?Math.round((x.used||0)/x.total*100):0}%</td></tr>`).join("")||`<tr><td colspan="6" class="empty">Sem dados.</td></tr>`}</tbody></table></div></div><div class="panel"><h2>Registo de leituras recentes</h2><div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Evento</th><th>Convidado</th><th>Resultado</th><th>Operador</th></tr></thead><tbody>${r.scans.map(s=>`<tr><td>${esc(s.scanned_at)}</td><td>${esc(s.event_name||"—")}</td><td>${esc(s.guest_name||"—")}</td><td><span class="pill ${s.result}">${esc(s.result)}</span></td><td>${esc(s.operator_name||"—")}</td></tr>`).join("")||`<tr><td colspan="5" class="empty">Ainda não há leituras.</td></tr>`}</tbody></table></div></div>`,"Relatórios");
}
async function showUsers(){
 const users=await api("/users");
 shell(`<div class="panel"><h2>Criar utilizador</h2><form id="user-form"><div class="grid2"><div class="field"><label>Nome</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Palavra-passe (mínimo 10 caracteres)</label><input name="password" type="password" minlength="10" required></div><div class="field"><label>Perfil</label><select name="role"><option value="operator">Operador de porta</option><option value="admin">Administrador</option></select></div></div><button>Criar utilizador</button><div id="user-msg"></div></form></div><div class="panel"><h2>Contas</h2><div class="table-wrap"><table><thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Estado</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${u.active?"Activo":"Inactivo"}</td><td><button class="secondary" data-toggle="${u.id}">${u.active?"Desactivar":"Activar"}</button></td></tr>`).join("")}</tbody></table></div></div>`,"Utilizadores");
 document.querySelector("#user-form").onsubmit=async e=>{e.preventDefault();try{await api("/users",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});showUsers();}catch(err){document.querySelector("#user-msg").innerHTML=notice(err.message,"error");}};
 document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=async()=>{try{await api(`/users/${b.dataset.toggle}/toggle`,{method:"PATCH"});showUsers();}catch(e){alert(e.message);}});
}
(async()=>{try{const r=await api("/auth/me");if(r.user){me=r.user;navigate("dashboard");}else renderLogin();}catch{renderLogin();}})();
