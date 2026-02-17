import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userDocs = await db
            .select({
                id: documents.id,
                fileName: documents.fileName,
                fileType: documents.fileType,
                createdAt: documents.createdAt,
            })
            .from(documents)
            .where(eq(documents.userId, session.user.id))
            .orderBy(desc(documents.createdAt));

        return NextResponse.json(userDocs);

    } catch (error: any) {
        console.error("List documents error:", error);
        return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
    }
}
