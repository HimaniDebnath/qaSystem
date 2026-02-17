import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    // Polyfills for pdf-parse in Node.js environment
    if (typeof global.DOMMatrix === "undefined") {
        (global as any).DOMMatrix = class DOMMatrix { };
    }
    if (typeof global.ImageData === "undefined") {
        (global as any).ImageData = class ImageData { };
    }
    if (typeof global.Path2D === "undefined") {
        (global as any).Path2D = class Path2D { };
    }

    const { PDFParse } = require("pdf-parse");
    let parser = null;

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
            // Configuration for pdf-parse to avoid worker module issues on Vercel
            // Setting disableWorker: true forces it to run in the main thread
            parser = new PDFParse({
                data: buffer,
                disableWorker: true,
                verbosity: -1 // Disable logs
            });
            const data = await parser.getText();
            content = data.text;
        } else if (file.type === "text/plain") {
            content = buffer.toString("utf-8");
        } else {
            return NextResponse.json({ error: "Unsupported file type. Please upload PDF or TXT." }, { status: 400 });
        }

        if (!content.trim()) {
            return NextResponse.json({ error: "File content is empty" }, { status: 400 });
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
    } finally {
        if (parser && typeof parser.destroy === 'function') {
            try {
                await parser.destroy();
            } catch (e) {
                console.error("Error destroying parser:", e);
            }
        }
    }
}
