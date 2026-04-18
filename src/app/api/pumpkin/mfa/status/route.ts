import { NextRequest } from "next/server";

import { proxyPumpkinRequest } from "@/lib/pumpkin-api-server";

export async function GET(req: NextRequest) {
  return proxyPumpkinRequest(req, {
    method: "GET",
    path: "/mfa/status",
  });
}
