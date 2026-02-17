import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
    const status = {
        database: "unknown",
        env: {
            DATABASE_URL: process.env.DATABASE_URL ? "Set" : "Missing",
            NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "Set" : "Missing",
            NEXTAUTH_URL: process.env.NEXTAUTH_URL ? process.env.NEXTAUTH_URL : "Missing",
        },
        error: null as any,
    };

    try {
        // Try a simple query
        await db.execute(sql`SELECT 1`);
        status.database = "Connected";
    } catch (err: any) {
        status.database = "Failed";
        status.error = err.message || "Unknown error";
        console.error("Health check DB error:", err);
    }

    return NextResponse.json(status);
}
