import { NextRequest, NextResponse } from "next/server";
import { saveGranolaConnection } from "@/lib/granolaStore";

const GRANOLA_BASE = "https://public-api.granola.ai/v1";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { apiKey?: string };
    const apiKey = body.apiKey?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Missing apiKey" }, { status: 400 });
    }

    // Validate by hitting /v1/notes — pull the owner from the first note.
    const res = await fetch(`${GRANOLA_BASE}/notes`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[granola/connect] validation failed ${res.status}: ${errText.slice(0, 200)}`);
      return NextResponse.json(
        { error: `Granola API rejected the token (HTTP ${res.status})` },
        { status: 400 }
      );
    }

    const data = await res.json();
    const notes = (data.notes || []) as Array<{ owner?: { name?: string; email?: string } }>;
    const owner = notes[0]?.owner;
    const ownerName = owner?.name || "Unknown";
    const ownerEmail = owner?.email || "";

    await saveGranolaConnection({
      apiKey,
      ownerName,
      ownerEmail,
      connectedAt: new Date().toISOString(),
    });

    console.log(`[granola/connect] ✓ Connected ${ownerName} (${ownerEmail}) — ${notes.length} notes visible`);

    return NextResponse.json({
      ok: true,
      ownerName,
      ownerEmail,
      noteCount: notes.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[granola/connect]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
