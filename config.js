// Configurações públicas da aplicação. Segredos ficam exclusivamente no .env.
export const appConfig = {
  appName: "Convite Único",
  defaultPageSize: 20,
  maxInvitesPerBatch: 500,
  timezone: process.env.TZ || "Africa/Luanda"
};