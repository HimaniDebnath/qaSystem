import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import pdf from "pdf-parse";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let content = "";

        if (file.type === "application/pdf") {
            try {
                // Using pdf-parse@1.1.1 which is more stable on Vercel
                const data = await pdf(buffer);
                content = data.text;
            } catch (pdfError: any) {
                console.error("PDF parsing error:", pdfError);
                return NextResponse.json({ error: `Could not parse PDF: ${pdfError.message}` }, { status: 500 });
            }
        } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
            content = buffer.toString("utf-8");
        } else {
            return NextResponse.json({ error: "Unsupported file type. Please upload PDF or TXT." }, { status: 400 });
        }

        if (!content || !content.trim()) {
            return NextResponse.json({ error: "File content is empty or could not be extracted" }, { status: 400 });
        }

        const [newDoc] = await db.insert(documents).values({
            userId: session.user.id,
            fileName: file.name,
            fileType: file.type,
            content: content,
        }).returning();

        return NextResponse.json({
            ...newDoc,
            message: "File uploaded and processed successfully"
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: `Upload processing failed: ${error.message}` }, { status: 500 });
    }
}
