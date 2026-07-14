"use client";

export const dynamic = "force-dynamic";

import { use } from "react";
import { ExternalProjectBoard } from "@/components/external-board-view";

export default function ExternalBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <ExternalProjectBoard editToken={token} />;
}
