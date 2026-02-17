import { NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const maxDuration = 60;

async function callGroq(prompt: string): Promise<string> {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) throw new Error("Groq API Key missing");

    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "You are a specialized AI that summarizes YouTube videos and creates structured study notes. Always return valid JSON." },
                { role: "user", content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 4096,
            response_format: { type: "json_object" }
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Groq API error:", errorData);
        throw new Error("Groq API request failed");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { url } = body;

        console.log(`[Summarize] Processing URL: ${url}`);

        if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
        if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "Groq API Key missing" }, { status: 500 });

        const videoIdMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : "";

        if (!videoId) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

        let transcriptText = "";
        let isFallback = false;

        // --- PHASE 1: TRANSCRIPT EXTRACTION ---
        try {
            console.log(`[Phase 1] Attempting transcript extraction for: ${videoId}`);
            const { YouTubeTranscriptApi } = await import("youtube-transcript-node");
            const api = new YouTubeTranscriptApi();

            const list = await api.list(videoId);
            let transcript;
            try {
                transcript = list.findManuallyCreatedTranscript(['en', 'en-US', 'en-GB']);
            } catch (e) {
                try {
                    transcript = list.findGeneratedTranscript(['en', 'en-US', 'en-GB']);
                } catch (e2) {
                    try {
                        transcript = list.findTranscript(['en', 'en-US', 'en-GB']);
                    } catch (e3) {
                        const allTranscripts = Array.from(list);
                        if (allTranscripts.length > 0) transcript = allTranscripts[0];
                    }
                }
            }

            if (transcript) {
                const fetched = await transcript.fetch();
                const snippets = (fetched as any).snippets || fetched;
                if (snippets && Array.isArray(snippets) && snippets.length > 0) {
                    transcriptText = snippets.map((s: any) => s.text).join(" ");
                }
            }
        } catch (e: any) {
            console.warn(`[Phase 1] Transcript extraction failed: ${e.message}. Moving to fallback.`);
        }

        // --- PHASE 2: METADATA FALLBACK ---
        if (!transcriptText || transcriptText.length < 50) {
            console.log(`[Phase 2] Using Metadata Fallback for: ${videoId}`);
            try {
                const info = await ytdl.getBasicInfo(videoId);
                const title = info.videoDetails.title;
                const description = info.videoDetails.description || "";

                transcriptText = `VIDEO TITLE: ${title}\n\nVIDEO DESCRIPTION:\n${description}`;
                isFallback = true;

                if (!title) throw new Error("Could not retrieve video metadata");
            } catch (fallbackError: any) {
                console.error("[Phase 2] Fallback failed:", fallbackError);
                return NextResponse.json({
                    error: "Could not retrieve transcript or video information. This video might be highly restricted or private."
                }, { status: 500 });
            }
        }

        // --- PHASE 3: AI GENERATION ---
        console.log(`[Summarize] Generating ${isFallback ? 'metadata' : 'transcript'} summary...`);
        const contextType = isFallback ? "video metadata (title and description)" : "video transcript";
        const prompt = `Analyze the following ${contextType} and provide:
        1. A concise summary of the main points (2-3 paragraphs).
        2. Structured study notes in Markdown format, with clear headings and bullet points.
        
        Keep in mind that this information comes from the ${contextType}.
        
        Return the result in this exact JSON format:
        {
          "summary": "The summary text...",
          "notes": "## Study Notes\\n### Topic\\n..."
        }

        Content:
        ${transcriptText.substring(0, 30000)}
        `;

        const aiText = await callGroq(prompt);
        let aiData;
        try {
            aiData = JSON.parse(aiText);
        } catch (e) {
            aiData = extractJsonFallback(aiText);
        }

        return NextResponse.json({
            ...aiData,
            transcript: transcriptText,
            isMetadataSummary: isFallback,
            message: isFallback ? "Note: Summary generated from video metadata because transcripts were unavailable." : undefined
        });

    } catch (error: any) {
        console.error("[Summarize] Critical error:", error);
        return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 });
    }
}

function extractJsonFallback(text: string) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { }
    return { summary: "Summary generation failed.", notes: text };
}
