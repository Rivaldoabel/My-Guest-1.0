import "dotenv/config";
import express from "express";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db.js";
import { login, requireAuth, requireAdmin, currentUser } from "./auth.js";
import { invitationPdf, invitationPng, invitationJpg } from "./documents.js";

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);
const port = Number(process.env.PORT || 3000);
const baseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes("MUDE_")) {
  console.warn("AVISO: defina SESSION_SECRET no .env antes de colocar a aplicação em produção.");
}
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: "./data" }),
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static("public"));
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

app.post("/api/auth/login", login);
app.post("/api/auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/auth/me", (req, res) => res.json({ user: currentUser(req) || null }));

app.get("/api/dashboard", requireAuth, (req, res) => {
  const events = db.prepare("SELECT COUNT(*) n FROM events").get().n;
  const total = db.prepare("SELECT COUNT(*) n FROM invitations").get().n;
  const used = db.prepare("SELECT COUNT(*) n FROM invitations WHERE status='used'").get().n;
  const unused = db.prepare("SELECT COUNT(*) n FROM invitations WHERE status='unused'").get().n;
  res.json({ events, total, used, unused });
});

app.get("/api/events", requireAuth, (_req, res) => {
  res.json(db.prepare(`SELECT e.*, COUNT(i.id) total,
    SUM(CASE WHEN i.status='used' THEN 1 ELSE 0 END) used
    FROM events e LEFT JOIN invitations i ON i.event_id=e.id
    GROUP BY e.id ORDER BY e.id DESC`).all());
});
app.post("/api/events", requireAdmin, (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(120), venue: z.string().max(160).optional(), event_date: z.string().max(30).optional(), capacity: z.coerce.number().int().positive().max(1000000).optional().or(z.literal("")) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do evento inválidos." });
  const d = parsed.data;
  const result = db.prepare("INSERT INTO events(name,venue,event_date,capacity,created_by) VALUES(?,?,?,?,?)")
    .run(d.name, d.venue || null, d.event_date || null, d.capacity || null, req.session.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});
app.patch("/api/events/:id/close", requireAdmin, (req, res) => {
  const r = db.prepare("UPDATE events SET status='closed' WHERE id=?").run(Number(req.params.id));
  res.json({ updated: r.changes });
});

app.post("/api/events/:id/invitations", requireAdmin, (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id=?").get(Number(req.params.id));
  if (!event || event.status !== "active") return res.status(404).json({ error: "Evento inexistente ou encerrado." });
  const schema = z.object({ quantity: z.coerce.number().int().min(1).max(500), names: z.array(z.string().trim().max(120)).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Quantidade inválida (1 a 500)." });
  const current = db.prepare("SELECT COUNT(*) n FROM invitations WHERE event_id=?").get(event.id).n;
  if (event.capacity && current + parsed.data.quantity > event.capacity) return res.status(400).json({ error: `Capacidade excedida. Restam ${Math.max(0,event.capacity-current)} convites.` });
  const insert = db.prepare("INSERT INTO invitations(event_id,guest_name,token,created_by) VALUES(?,?,?,?)");
  const createMany = db.transaction(() => {
    const ids = [];
    for (let i=0; i<parsed.data.quantity; i++) {
      const token = crypto.randomBytes(32).toString("base64url");
      const name = parsed.data.names?.[i] || null;
      ids.push(Number(insert.run(event.id, name, token, req.session.user.id).lastInsertRowid));
    }
    return ids;
  });
  res.status(201).json({ ids: createMany() });
});

app.get("/api/invitations", requireAuth, (req, res) => {
  const eventId = req.query.event ? Number(req.query.event) : null;
  const search = `%${String(req.query.search || "").slice(0,100)}%`;
  const rows = db.prepare(`SELECT i.id,i.event_id,i.guest_name,i.status,i.created_at,i.used_at,
    e.name event_name,u.name used_by_name FROM invitations i
    JOIN events e ON e.id=i.event_id LEFT JOIN users u ON u.id=i.used_by
    WHERE (? IS NULL OR i.event_id=?) AND (COALESCE(i.guest_name,'') LIKE ? OR CAST(i.id AS TEXT) LIKE ?)
    ORDER BY i.id DESC LIMIT 1000`).all(eventId,eventId,search,search);
  res.json(rows);
});

app.get("/api/invitations/:id/pdf", requireAuth, async (req, res) => {
  const invite = db.prepare("SELECT * FROM invitations WHERE id=?").get(Number(req.params.id));
  if (!invite) return res.status(404).json({ error: "Convite não encontrado." });
  const event = db.prepare("SELECT * FROM events WHERE id=?").get(invite.event_id);
  await invitationPdf(invite,event,baseUrl,res);
});
app.get("/api/invitations/:id/png", requireAuth, async (req,res) => {
  const invite=db.prepare("SELECT * FROM invitations WHERE id=?").get(Number(req.params.id));
  if(!invite) return res.status(404).json({error:"Convite não encontrado."});
  const event=db.prepare("SELECT * FROM events WHERE id=?").get(invite.event_id);
  const svg=await invitationPng(invite,event,baseUrl);
  res.setHeader("Content-Type","image/png");
  res.setHeader("Content-Disposition",`attachment; filename="convite-${invite.id}.png"`);
  res.send(svg);
});
app.get("/api/invitations/:id/jpg", requireAuth, async (req,res) => {
  const invite=db.prepare("SELECT * FROM invitations WHERE id=?").get(Number(req.params.id));
  if(!invite) return res.status(404).json({error:"Convite não encontrado."});
  const event=db.prepare("SELECT * FROM events WHERE id=?").get(invite.event_id);
  const jpg=await invitationJpg(invite,event,baseUrl);
  res.setHeader("Content-Type","image/jpeg");
  res.setHeader("Content-Disposition",`attachment; filename="convite-${invite.id}.jpg"`);
  res.send(jpg);
});

const scanSchema = z.object({ token: z.string().min(20).max(200) });
app.post("/api/scan", requireAuth, (req,res) => {
  const parsed=scanSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({ result:"invalid", message:"Código QR inválido." });
  const token=parsed.data.token.trim().split("/").pop();
  const operator=req.session.user.id;
  // BEGIN IMMEDIATE serializa leitores concorrentes: apenas uma leitura pode consumir o convite.
  const scan=db.transaction(() => {
    const invite=db.prepare("SELECT i.*,e.name event_name,e.status event_status FROM invitations i JOIN events e ON e.id=i.event_id WHERE i.token=?").get(token);
    if(!invite) {
      db.prepare("INSERT INTO scan_logs(token_fragment,result,operator_id) VALUES(?,?,?)").run(token.slice(-8),"invalid",operator);
      return {result:"invalid",message:"Convite não reconhecido."};
    }
    if(invite.event_status!=="active" || invite.status==="revoked") {
      db.prepare("INSERT INTO scan_logs(invitation_id,result,operator_id) VALUES(?,?,?)").run(invite.id,"blocked",operator);
      return {result:"blocked",message:"Este convite não está autorizado para entrada.",guest:invite.guest_name,event:invite.event_name};
    }
    if(invite.status==="used") {
      db.prepare("INSERT INTO scan_logs(invitation_id,result,operator_id) VALUES(?,?,?)").run(invite.id,"duplicate",operator);
      return {result:"duplicate",message:"ATENÇÃO: este convite já foi utilizado.",guest:invite.guest_name,event:invite.event_name,used_at:invite.used_at};
    }
    const changed=db.prepare("UPDATE invitations SET status='used',used_at=CURRENT_TIMESTAMP,used_by=? WHERE id=? AND status='unused'").run(operator,invite.id);
    if(changed.changes!==1) return {result:"duplicate",message:"Este convite já foi utilizado."};
    db.prepare("INSERT INTO scan_logs(invitation_id,result,operator_id) VALUES(?,?,?)").run(invite.id,"accepted",operator);
    return {result:"accepted",message:"Entrada autorizada. Primeiro registo efectuado.",guest:invite.guest_name || "Convidado",event:invite.event_name};
  });
  const outcome=scan.immediate();
  res.json(outcome);
});

app.get("/api/reports", requireAdmin, (req,res) => {
  const eventId=req.query.event ? Number(req.query.event) : null;
  const summary=db.prepare(`SELECT e.id,e.name,e.event_date,e.venue,COUNT(i.id) total,
    SUM(CASE WHEN i.status='used' THEN 1 ELSE 0 END) used,
    SUM(CASE WHEN i.status='unused' THEN 1 ELSE 0 END) unused,
    SUM(CASE WHEN i.status='revoked' THEN 1 ELSE 0 END) revoked
    FROM events e LEFT JOIN invitations i ON i.event_id=e.id
    WHERE (? IS NULL OR e.id=?) GROUP BY e.id ORDER BY e.id DESC`).all(eventId,eventId);
  const scans=db.prepare(`SELECT s.scanned_at,s.result,i.guest_name,e.name event_name,u.name operator_name
    FROM scan_logs s LEFT JOIN invitations i ON i.id=s.invitation_id
    LEFT JOIN events e ON e.id=i.event_id LEFT JOIN users u ON u.id=s.operator_id
    WHERE (? IS NULL OR i.event_id=?) ORDER BY s.id DESC LIMIT 500`).all(eventId,eventId);
  res.json({summary,scans});
});
app.get("/api/reports.csv", requireAdmin, (req,res) => {
  const rows=db.prepare(`SELECT i.id,e.name event_name,COALESCE(i.guest_name,'Convidado') guest,
    i.status,i.created_at,i.used_at,COALESCE(u.name,'') operator
    FROM invitations i JOIN events e ON e.id=i.event_id LEFT JOIN users u ON u.id=i.used_by
    ORDER BY i.id DESC`).all();
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const csv=["ID;Evento;Convidado;Estado;Criado em;Utilizado em;Operador",...rows.map(r=>[r.id,r.event_name,r.guest,r.status,r.created_at,r.used_at,r.operator].map(esc).join(";"))].join("\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="relatorio-convites.csv"');
  res.send("\uFEFF"+csv);
});

app.get("/api/users", requireAdmin, (_req,res)=>res.json(db.prepare("SELECT id,name,email,role,active,created_at FROM users ORDER BY id DESC").all()));
app.post("/api/users", requireAdmin, async (req,res)=>{
  const p=z.object({name:z.string().trim().min(2).max(100),email:z.string().email(),password:z.string().min(10),role:z.enum(["admin","operator"]) }).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:"Verifique os dados. A palavra-passe deve ter pelo menos 10 caracteres."});
  try{
    const hash=await bcrypt.hash(p.data.password,12);
    const r=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(p.data.name,p.data.email,hash,p.data.role);
    res.status(201).json({id:r.lastInsertRowid});
  }catch{res.status(409).json({error:"Já existe uma conta com esse email."});}
});
app.patch("/api/users/:id/toggle",requireAdmin,(req,res)=>{
  if(Number(req.params.id)===req.session.user.id)return res.status(400).json({error:"Não pode desactivar a própria conta."});
  const r=db.prepare("UPDATE users SET active=1-active WHERE id=?").run(Number(req.params.id));
  res.json({updated:r.changes});
});

// URL incluído no QR: a página informa que o código deve ser lido pela aplicação autenticada.
app.get("/check/:token", (req,res)=>res.sendFile("index.html",{root:"public"}));
app.get("*", (req,res)=>res.sendFile("index.html",{root:"public"}));

app.listen(port,()=>console.log(`Convite Único disponível em ${baseUrl}`));
