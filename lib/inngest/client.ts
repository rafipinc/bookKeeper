import { Inngest } from "inngest";

const hasEventKey = Boolean(process.env.INNGEST_EVENT_KEY);
const explicitDevMode = process.env.INNGEST_DEV;
const isLocalDevWithoutEventKey =
  process.env.NODE_ENV !== "production" && !hasEventKey && explicitDevMode === undefined;

export const inngest = new Inngest({
  id: "bookkeeping-app",
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev: isLocalDevWithoutEventKey ? true : undefined,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
