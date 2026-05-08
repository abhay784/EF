import { NextResponse } from "next/server";
import { deleteGranolaConnection } from "@/lib/granolaStore";

export async function POST() {
  await deleteGranolaConnection();
  console.log("[granola/disconnect] ✓ removed connection");
  return NextResponse.json({ ok: true });
}
