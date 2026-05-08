import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getInstall } from "@/lib/slackStore";

export async function GET() {
  const teamId = cookies().get("slack_team_id")?.value;
  if (!teamId) {
    return NextResponse.json({ connected: false, teamId: null, teamName: null });
  }

  const install = await getInstall(teamId);
  if (!install) {
    return NextResponse.json({ connected: false, teamId: null, teamName: null });
  }

  return NextResponse.json({
    connected: true,
    teamId: install.teamId,
    teamName: install.teamName,
  });
}
