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
        let fallbackSource = "none";

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
                    fallbackSource = "transcript";
                }
            }
        } catch (e: any) {
            console.warn(`[Phase 1] Transcript extraction failed: ${e.message}`);
        }

        // --- PHASE 2: YTDL METADATA FALLBACK ---
        if (!transcriptText || transcriptText.length < 50) {
            console.log(`[Phase 2] Attempting YTDL metadata fallback for: ${videoId}`);
            try {
                const info = await ytdl.getBasicInfo(videoId);
                const title = info.videoDetails.title;
                const description = info.videoDetails.description || "";

                if (title) {
                    transcriptText = `VIDEO TITLE: ${title}\n\nVIDEO DESCRIPTION:\n${description}`;
                    isFallback = true;
                    fallbackSource = "ytdl";
                }
            } catch (fallbackError: any) {
                console.warn("[Phase 2] YTDL fallback failed:", fallbackError.message);
            }
        }

        // --- PHASE 3: OEMBED FALLBACK (Ultimate Resilience) ---
        if (!transcriptText || transcriptText.length < 10) {
            console.log(`[Phase 3] Attempting OEmbed fallback for: ${videoId}`);
            try {
                const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
                const res = await fetch(oembedUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) {
                        transcriptText = `VIDEO TITLE: ${data.title}\nAUTHOR: ${data.author_name}\n\n(Note: Only basic metadata could be retrieved for this video.)`;
                        isFallback = true;
                        fallbackSource = "oembed";
                    }
                }
            } catch (oembedError: any) {
                console.error("[Phase 3] OEmbed fallback failed:", oembedError.message);
            }
        }

        if (!transcriptText || transcriptText.length < 10) {
            return NextResponse.json({
                error: "YouTube is blocking access to this video's information. This often happens with restricted, music, or age-gated videos on serverless environments. Please try a different video."
            }, { status: 500 });
        }

        // --- PHASE 4: AI GENERATION ---
        console.log(`[Summarize] Generating summary from ${fallbackSource}...`);
        const contextType = isFallback ? "video metadata" : "video transcript";
        const prompt = `Analyze the following ${contextType} and provide:
        1. A concise summary of the main points (2-3 paragraphs).
        2. Structured study notes in Markdown format, with clear headings and bullet points.
        
        Note: If only a title and description/author are provided, generate the best possible summary based on that context.
        
        Return the result in this exact JSON format:
        {
          "summary": "The summary text...",
          "notes": "## Study Notes\\n### Topic\\n..."
        }

        Content to analyze:
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
            fallbackSource: fallbackSource,
            message: isFallback ? "Note: Summary generated from video metadata because transcripts were blocked or unavailable." : undefined
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
