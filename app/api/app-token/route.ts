import { NextResponse } from "next/server";

// Streamlit bridge deprecated: endpoint disabled intentionally
export async function POST() {
  return NextResponse.json(
    { error: "Streamlit bridge disabled" },
    { status: 410 }
  );
}