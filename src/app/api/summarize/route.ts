import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import ytdl from "@distube/ytdl-core";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const maxDuration = 60;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

        if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
        if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "Groq API Key missing" }, { status: 500 });

        const videoIdMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : "";

        if (!videoId) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

        let transcriptText = "";

        // --- PHASE 1: TRANSCRIPT EXTRACTION ---

        // method 1: YoutubeTranscript
        try {
            console.log(`[Phase 1.1] YoutubeTranscript for: ${videoId}`);
            const transcript = await YoutubeTranscript.fetchTranscript(videoId);
            if (transcript && transcript.length > 0) {
                transcriptText = transcript.map(t => t.text).join(" ");
                console.log(`[Phase 1.1] Success (${transcriptText.length} chars)`);
            }
        } catch (e) {
            console.warn("[Phase 1.1] Failed:", e instanceof Error ? e.message : "Unknown error");
        }

        // method 2: ytdl-core metadata (Fallback)
        if (!transcriptText || transcriptText.length < 100) {
            try {
                console.log(`[Phase 1.2] @distube/ytdl-core metadata for: ${videoId}`);
                const info = await ytdl.getInfo(url, {
                    requestOptions: {
                        headers: {
                            "User-Agent": USER_AGENT,
                        }
                    }
                });

                const tracks = info.player_response.captions?.playerCaptionsTracklistRenderer?.captionTracks;

                if (tracks && tracks.length > 0) {
                    // Try to find English, then auto English, then any
                    const track = tracks.find((t: any) => t.languageCode === 'en' && !t.kind) ||
                        tracks.find((t: any) => t.languageCode === 'en') ||
                        tracks.find((t: any) => t.languageCode.startsWith('en')) ||
                        tracks[0];

                    if (track) {
                        console.log(`[Phase 1.2] Found track: ${track.languageCode} (${track.kind || 'manual'})`);
                        const res = await fetch(track.baseUrl, {
                            headers: { "User-Agent": USER_AGENT }
                        });
                        const xml = await res.text();

                        const cleaned = xml
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'")
                            .replace(/&nbsp;/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();

                        if (cleaned.length > 50) { // Lowered threshold slightly
                            transcriptText = cleaned;
                            console.log(`[Phase 1.2] Success (${transcriptText.length} chars)`);
                        }
                    }
                } else {
                    console.log("[Phase 1.2] No caption tracks found in metadata");
                }
            } catch (e) {
                console.warn("[Phase 1.2] Failed:", e instanceof Error ? e.message : "Unknown error");
            }
        }

        if (transcriptText && transcriptText.length > 50) {
            console.log("[Groq] Processing via Transcript");
            const prompt = `Analyze the following YouTube transcript and provide:
            1. A concise summary of the main points (2-3 paragraphs).
            2. Structured study notes in Markdown format, with clear headings and bullet points.
            
            Return the result in this exact JSON format:
            {
              "summary": "The summary text...",
              "notes": "## Study Notes\\n### Introduction\\n- Point 1..."
            }

            Transcript:
            ${transcriptText.substring(0, 30000)}
            `;

            const aiText = await callGroq(prompt);
            let aiData;
            try {
                aiData = JSON.parse(aiText);
            } catch (e) {
                console.error("Failed to parse JSON from AI response:", aiText);
                aiData = extractJsonFallback(aiText);
            }

            return NextResponse.json({ ...aiData, transcript: transcriptText });
        } else {
            console.log("[Phase 2] No valid transcript found at all.");
            return NextResponse.json({
                error: "No transcript could be found for this video. This happens if the video is restricted, private, or doesn't have English captions. Please try a different video with captions enabled."
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error("Critical Failure:", error);
        return NextResponse.json({ error: "Server error: " + (error.message || "Unknown error") }, { status: 500 });
    }
}

function extractJsonFallback(text: string) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) { }

    return {
        summary: "Summary extraction failed.",
        notes: text,
        transcript: "Transcript extraction succeeded but parsing failed."
    };
}
