import { NextResponse } from "next/server";
import { getGranolaConnection } from "@/lib/granolaStore";

export async function GET() {
  const conn = await getGranolaConnection();
  if (!conn) {
    return NextResponse.json({
      connected: false,
      ownerName: null,
      ownerEmail: null,
    });
  }
  return NextResponse.json({
    connected: true,
    ownerName: conn.ownerName,
    ownerEmail: conn.ownerEmail,
    connectedAt: conn.connectedAt,
  });
}
