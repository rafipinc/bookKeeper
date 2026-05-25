import { Inngest } from "inngest";

const explicitDevMode = process.env.INNGEST_DEV;
const isLocalDev =
  process.env.NODE_ENV !== "production" &&
  explicitDevMode !== "0" &&
  explicitDevMode !== "false";

export const inngest = new Inngest({
  id: "bookkeeping-app",
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev: isLocalDev ? true : undefined,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
