import { inngest } from "../client";

export const helloPing = inngest.createFunction(
  {
    id: "hello-ping",
    triggers: { event: "app/hello.ping" },
  },
  async ({ event, logger }) => {
    const message =
      typeof event.data?.message === "string" ? event.data.message : "hi";

    logger.info("helloPing received app/hello.ping", { message });

    return { message };
  },
);
