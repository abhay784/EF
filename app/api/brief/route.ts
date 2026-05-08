import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import type { WeeklyBrief } from "@/lib/types";

export async function GET() {
  const briefPath = path.join(process.cwd(), "context", "weekly_brief.json");

  if (!existsSync(briefPath)) {
    return NextResponse.json(
      { error: "No brief found. Run /api/sync first." },
      { status: 404 }
    );
  }

  try {
    const content = readFileSync(briefPath, "utf-8");
    const brief: WeeklyBrief = JSON.parse(content);
    return NextResponse.json(brief);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read brief file" },
      { status: 500 }
    );
  }
}
