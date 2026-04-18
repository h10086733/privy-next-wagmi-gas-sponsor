import { NextRequest } from "next/server";

import { proxyPumpkinRequest } from "@/lib/pumpkin-api-server";

export async function POST(req: NextRequest) {
  return proxyPumpkinRequest(req, {
    method: "POST",
    path: "/ax/user/withdraw",
  });
}
