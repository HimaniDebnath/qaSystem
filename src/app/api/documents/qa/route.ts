import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { documentId, question } = await req.json();

        if (!documentId || !question) {
            return NextResponse.json({ error: "Document ID and question are required" }, { status: 400 });
        }

        const [doc] = await db
            .select()
            .from(documents)
            .where(
                and(
                    eq(documents.id, documentId),
                    eq(documents.userId, session.user.id)
                )
            )
            .limit(1);

        if (!doc) {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
            return NextResponse.json({ error: "Groq API Key missing" }, { status: 500 });
        }

        const prompt = `You are a helpful assistant. Answer the following question based on the provided document content.
If the answer is not in the document, say that you don't know based on the document.

Document Title: ${doc.fileName}
Document Content:
---
${doc.content}
---

Question: ${question}
Answer:`;

        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${groqApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Groq API error:", errorData);
            return NextResponse.json({ error: "Failed to generate answer from AI" }, { status: 500 });
        }

        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content || "No answer generated.";

        return NextResponse.json({ answer });

    } catch (error: any) {
        console.error("QA error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate answer" }, { status: 500 });
    }
}
