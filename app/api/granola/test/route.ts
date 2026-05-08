import { NextResponse } from "next/server";
import { getGranolaConnection } from "@/lib/granolaStore";

const GRANOLA_BASE = "https://public-api.granola.ai/v1";

export async function GET() {
  const conn = await getGranolaConnection();
  if (!conn) {
    return NextResponse.json(
      { error: "not_connected", message: "Granola not connected. Click the granola chip to connect." },
      { status: 400 }
    );
  }

  console.log(`[granola/test] querying notes for ${conn.ownerEmail}`);

  const res = await fetch(`${GRANOLA_BASE}/notes`, {
    headers: { Authorization: `Bearer ${conn.apiKey}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: "granola_api_error", status: res.status, body: text.slice(0, 500) },
      { status: 502 }
    );
  }

  const data = await res.json();
  const notes = (data.notes || []) as Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    owner?: { name?: string; email?: string };
  }>;

  const recent = notes.slice(0, 5).map((n) => ({
    id: n.id,
    title: n.title,
    created_at: n.created_at,
    updated_at: n.updated_at,
  }));

  console.log(`[granola/test] returned ${notes.length} notes total, sampling ${recent.length}`);

  return NextResponse.json({
    owner: { name: conn.ownerName, email: conn.ownerEmail },
    note_count: notes.length,
    sample: recent,
  });
}
