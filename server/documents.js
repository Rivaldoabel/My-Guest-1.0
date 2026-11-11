import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { db } from "./db.js";

export async function invitationPng(invite, event, baseUrl) {
  const qr = await QRCode.toDataURL(`${baseUrl}/check/${invite.token}`, { width: 700, margin: 2, errorCorrectionLevel: "H", color: { dark: "#17233b", light: "#ffffff" } });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1250"><rect width="100%" height="100%" rx="36" fill="#f7f8fa"/><rect x="35" y="35" width="930" height="1180" rx="28" fill="white" stroke="#e4e8ef" stroke-width="3"/><text x="500" y="145" font-family="Arial" font-size="34" fill="#718096" text-anchor="middle">CONVITE DIGITAL</text><text x="500" y="240" font-family="Arial" font-weight="bold" font-size="54" fill="#17233b" text-anchor="middle">${escapeXml(event.name).slice(0,45)}</text><text x="500" y="330" font-family="Arial" font-size="30" fill="#4a5568" text-anchor="middle">${escapeXml(invite.guest_name || "Convidado")}</text><image href="${qr}" x="200" y="390" width="600" height="600"/><text x="500" y="1060" font-family="Arial" font-size="25" fill="#718096" text-anchor="middle">Apresente este QR Code à entrada</text><text x="500" y="1120" font-family="Arial" font-size="20" fill="#a0aec0" text-anchor="middle">Convite individual • utilização única</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
function escapeXml(value) { return String(value ?? "").replace(/[<>&'"]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", '"':"&quot;" }[c])); }

export async function invitationJpg(invite, event, baseUrl) {
  const png = await invitationPng(invite, event, baseUrl);
  return sharp(png).jpeg({ quality: 92 }).toBuffer();
}

export async function invitationPdf(invite, event, baseUrl, res) {
  const doc = new PDFDocument({ size: "A5", margin: 35 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="convite-${invite.id}.pdf"`);
  doc.pipe(res);
  doc.roundedRect(20, 20, 380, 555, 18).fill("#f7f8fa");
  doc.fillColor("#718096").fontSize(12).text("CONVITE DIGITAL", 35, 65, { align: "center" });
  doc.fillColor("#17233b").fontSize(23).font("Helvetica-Bold").text(event.name, 35, 110, { align: "center", width: 350 });
  doc.font("Helvetica").fillColor("#4a5568").fontSize(16).text(invite.guest_name || "Convidado", 35, 175, { align: "center" });
  const qr = await QRCode.toBuffer(`${baseUrl}/check/${invite.token}`, { width: 500, margin: 1 });
  doc.image(qr, 105, 220, { fit: [210, 210], align: "center" });
  doc.fillColor("#718096").fontSize(11).text("Apresente este QR Code à entrada", 35, 465, { align: "center" });
  doc.fontSize(9).text("Convite individual • utilização única", 35, 490, { align: "center" });
  doc.end();
}
