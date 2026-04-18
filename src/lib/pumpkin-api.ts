export type PumpkinEnvelope<T> = {
  message: string;
  time: string;
  code: number;
  data: T;
};

export type PumpkinUserInfo = Record<string, unknown> & {
  mfaBound?: boolean | null;
};

export type PumpkinMfaStatus = {
  bound: boolean;
  pendingBind: boolean;
  type: string;
  issuer: string;
  account: string;
  digits: number;
  periodSeconds: number;
  bindTime?: string | null;
  secret?: string;
  otpauthUrl?: string;
};

export type PumpkinMfaBindPayload = {
  timestamp: number;
  sign: string;
  code?: string;
};

export type PumpkinWithdrawPayload = {
  val: unknown;
  mfaCode?: string;
};

export class PumpkinApiError extends Error {
  code?: number;
  status?: number;

  constructor(message: string, options?: { code?: number; status?: number }) {
    super(message);
    this.name = "PumpkinApiError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

type PumpkinRequestOptions = {
  accessToken: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
};

function isPumpkinEnvelope(payload: unknown): payload is PumpkinEnvelope<unknown> {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<PumpkinEnvelope<unknown>>;
  return (
    typeof candidate.message === "string" &&
    typeof candidate.code === "number" &&
    "data" in candidate
  );
}

function toPumpkinApiError(
  status: number,
  payload: unknown,
  fallbackMessage: string,
): PumpkinApiError {
  if (isPumpkinEnvelope(payload)) {
    return new PumpkinApiError(
      payload.code === 200 ? fallbackMessage : `${payload.message} (code: ${payload.code})`,
      {
        code: payload.code,
        status,
      },
    );
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.error === "string"
          ? candidate.error
          : typeof candidate.detail === "string"
            ? candidate.detail
            : fallbackMessage;

    return new PumpkinApiError(message, { status });
  }

  return new PumpkinApiError(fallbackMessage, { status });
}

async function pumpkinApiRequest<T>(
  path: string,
  { accessToken, method = "GET", body, signal }: PumpkinRequestOptions,
): Promise<PumpkinEnvelope<T>> {
  const hasBody = body !== undefined;
  const response = await fetch(`/api/pumpkin/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });

  const responseText = await response.text();
  let payload: unknown = {};

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      payload = { message: responseText };
    }
  }

  if (!response.ok) {
    throw toPumpkinApiError(response.status, payload, "Pumpkin request failed");
  }

  if (!isPumpkinEnvelope(payload)) {
    throw new PumpkinApiError("Pumpkin response is not in the expected format", {
      status: response.status,
    });
  }

  if (payload.code !== 200) {
    throw toPumpkinApiError(response.status, payload, "Pumpkin request failed");
  }

  return payload as PumpkinEnvelope<T>;
}

export function fetchPumpkinUserInfo(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PumpkinEnvelope<PumpkinUserInfo>> {
  return pumpkinApiRequest<PumpkinUserInfo>("ax/user/infos", {
    accessToken,
    signal,
  });
}

export function fetchPumpkinMfaStatus(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PumpkinEnvelope<PumpkinMfaStatus>> {
  return pumpkinApiRequest<PumpkinMfaStatus>("mfa/status", {
    accessToken,
    signal,
  });
}

export function bindPumpkinMfa(
  accessToken: string,
  body: PumpkinMfaBindPayload,
): Promise<PumpkinEnvelope<PumpkinMfaStatus>> {
  return pumpkinApiRequest<PumpkinMfaStatus>("mfa/bind", {
    accessToken,
    method: "POST",
    body,
  });
}

export function unbindPumpkinMfa(
  accessToken: string,
  body: Required<PumpkinMfaBindPayload>,
): Promise<PumpkinEnvelope<PumpkinMfaStatus>> {
  return pumpkinApiRequest<PumpkinMfaStatus>("mfa/unbind", {
    accessToken,
    method: "POST",
    body,
  });
}

export function submitPumpkinWithdraw<T = unknown>(
  accessToken: string,
  body: PumpkinWithdrawPayload,
): Promise<PumpkinEnvelope<T>> {
  return pumpkinApiRequest<T>("ax/user/withdraw", {
    accessToken,
    method: "POST",
    body,
  });
}
