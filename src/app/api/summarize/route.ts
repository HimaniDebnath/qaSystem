import { NextRequest, NextResponse } from "next/server";

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

        // --- PHASE 1: TRANSCRIPT EXTRACTION ---
        try {
            console.log(`[Phase 1] Using YouTubeTranscriptApi for: ${videoId}`);
            const { YouTubeTranscriptApi } = await import("youtube-transcript-node");
            const api = new YouTubeTranscriptApi();

            // Try fetching with default languages
            const transcript = await api.fetch(videoId);

            // The library returns a FetchedTranscript object with a 'snippets' property
            // We can also iterate over it directly as it implements Symbol.iterator
            const snippets = (transcript as any).snippets || transcript;

            if (snippets && Array.isArray(snippets) && snippets.length > 0) {
                transcriptText = snippets.map((s: any) => s.text).join(" ");
                console.log(`[Phase 1] Success! Extracted ${transcriptText.length} characters.`);
            } else if (typeof transcript === 'object' && transcript !== null) {
                // Handle cases where the object might have a different structure
                console.log("[Phase 1] Transcript structure:", Object.keys(transcript));
            }
        } catch (e: any) {
            console.error("[Phase 1] Extraction failed:", e.message || e);

            // Fallback error messaging
            if (e.message?.includes("Transcripts are disabled")) {
                return NextResponse.json({ error: "Transcripts are disabled for this video." }, { status: 500 });
            }
        }

        if (transcriptText && transcriptText.length > 30) {
            console.log(`[Summarize] Generating AI summary...`);
            const prompt = `Analyze the following YouTube transcript and provide:
            1. A concise summary of the main points (2-3 paragraphs).
            2. Structured study notes in Markdown format, with clear headings and bullet points.
            
            Return the result in this exact JSON format:
            {
              "summary": "The summary text...",
              "notes": "## Study Notes\\n### Topic\\n..."
            }

            Transcript:
            ${transcriptText.substring(0, 30000)}
            `;

            const aiText = await callGroq(prompt);
            let aiData;
            try {
                aiData = JSON.parse(aiText);
            } catch (e) {
                aiData = extractJsonFallback(aiText);
            }

            return NextResponse.json({ ...aiData, transcript: transcriptText });
        } else {
            return NextResponse.json({
                error: "Could not retrieve video transcript. This video might not have English captions or is restricted. Please try another video."
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error("[Summarize] Critical error:", error);
        return NextResponse.json({ error: "Server error: " + (error.message || "Unknown error") }, { status: 500 });
    }
}

function extractJsonFallback(text: string) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { }
    return { summary: "Summary generation failed.", notes: text, transcript: "Transcript extracted." };
}
