type DebugValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | DebugValue[]
  | { [key: string]: DebugValue };

export function xeroDebug(event: string, data: Record<string, DebugValue> = {}) {
  if (!isXeroDebugEnabled()) {
    return;
  }

  console.info(`[xero.debug] ${event}`, data);
}

export function xeroError(event: string, error: unknown, data: Record<string, DebugValue> = {}) {
  console.error(`[xero.error] ${event}`, {
    ...data,
    error: serializeError(error),
  });
}

export function summarizeValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return {
    length: value.length,
    prefix: value.slice(0, 6),
    suffix: value.slice(-6),
  };
}

export function clientIdSuffix(clientId: string) {
  return clientId.slice(-6);
}

function isXeroDebugEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.XERO_DEBUG === "1";
}

function serializeError(error: unknown): DebugValue {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.parse(JSON.stringify(error)) as DebugValue;
  } catch {
    return String(error);
  }
}
