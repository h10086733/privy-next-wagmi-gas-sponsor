import { NextRequest, NextResponse } from "next/server";

type PumpkinProxyMethod = "GET" | "POST";

type ProxyPumpkinRequestOptions = {
  method: PumpkinProxyMethod;
  path: string;
};

function getPumpkinApiBaseUrl(): string {
  const baseUrl =
    process.env.PUMPKIN_API_BASE_URL ??
    process.env.NEXT_PUBLIC_PUMPKIN_API_BASE_URL ??
    "https://test-app.pumpkin.date";

  return baseUrl.replace(/\/+$/, "");
}

function getPumpkinAccessToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "").trim();
  }

  const tokenHeader = req.headers.get("token");
  if (tokenHeader) {
    return tokenHeader.trim();
  }

  return null;
}

export async function proxyPumpkinRequest(
  req: NextRequest,
  { method, path }: ProxyPumpkinRequestOptions,
): Promise<NextResponse> {
  const accessToken = getPumpkinAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const requestBody = method === "GET" ? undefined : await req.text();
  const upstreamUrl = `${getPumpkinApiBaseUrl()}${path}${req.nextUrl.search}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: {
        token: accessToken,
        ...(requestBody
          ? {
              "Content-Type":
                req.headers.get("content-type") ?? "application/json",
            }
          : {}),
      },
      body: requestBody,
      cache: "no-store",
    });

    const responseText = await upstreamResponse.text();

    return new NextResponse(responseText, {
      status: upstreamResponse.status,
      headers: {
        "cache-control": "no-store",
        "content-type":
          upstreamResponse.headers.get("content-type") ??
          "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Pumpkin upstream request failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
