import bcrypt from "bcryptjs";
import { db } from "./db.js";

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ error: "Preencha o email e a palavra-passe." });
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email.trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Credenciais inválidas." });
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ user: req.session.user });
}
export function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Sessão não autenticada." });
  next();
}
export function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "Acesso reservado ao administrador." });
  next();
}
export function currentUser(req) { return req.session.user; }
