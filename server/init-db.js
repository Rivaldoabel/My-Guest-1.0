import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
dotenv.config();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.startsWith("MUDE_")) {
  console.error("Defina ADMIN_EMAIL e uma ADMIN_PASSWORD forte no ficheiro .env.");
  process.exit(1);
}
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (!existing) {
  const hash = await bcrypt.hash(password, 12);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')")
    .run(process.env.ADMIN_NAME || "Administrador", email, hash);
  console.log(`Administrador criado: ${email}`);
} else {
  console.log("Administrador já existe; nenhuma palavra-passe foi alterada.");
}
console.log("Base de dados inicializada.");
