import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import ytdl from "@distube/ytdl-core";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const maxDuration = 60;

const YTDLP_PATH = path.join(process.cwd(), ".venv/bin/yt-dlp");

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
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 4096,
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

        // --- PHASE 1: TRANSCRIPT SEARCH ---

        // method 1: YoutubeTranscript (Fastest)
        try {
            console.log(`[Phase 1.1] YoutubeTranscript for: ${videoId}`);
            const transcript = await YoutubeTranscript.fetchTranscript(videoId);
            if (transcript && transcript.length > 0) {
                transcriptText = transcript.map(t => t.text).join("\n");
                console.log("[Phase 1.1] Success.");
            }
        } catch (e) {
            console.warn("[Phase 1.1] Failed.");
        }

        // method 2: yt-dlp subtitles (Local Robust)
        if (!transcriptText && fs.existsSync(YTDLP_PATH)) {
            try {
                console.log(`[Phase 1.2] yt-dlp subtitles for: ${videoId}`);
                transcriptText = await fetchSubtitleWithYtDlp(url);
                if (transcriptText) console.log("[Phase 1.2] Success.");
            } catch (e) {
                console.warn("[Phase 1.2] Failed.");
            }
        }

        // method 3: ytdl-core metadata (Vercel Fallback)
        if (!transcriptText) {
            try {
                console.log(`[Phase 1.3] ytdl-core metadata for: ${videoId}`);
                const info = await ytdl.getInfo(url);
                const tracks = info.player_response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (tracks && tracks.length > 0) {
                    const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
                    if (track) {
                        const res = await fetch(track.baseUrl);
                        const xml = await res.text();
                        transcriptText = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        console.log("[Phase 1.3] Success.");
                    }
                }
            } catch (e) {
                console.warn("[Phase 1.3] Failed.");
            }
        }

        if (transcriptText && transcriptText.length > 100) {
            console.log("[Groq] Processing via Transcript");
            const prompt = `Analyze this YouTube transcript and generate:
            1. A concise summary (2-3 paragraphs).
            2. Structured study notes in markdown.
            
            Transcript:
            ${transcriptText.substring(0, 20000)}
            
            Format as JSON: {"summary": "...", "notes": "..."}`;

            const aiText = await callGroq(prompt);
            const aiData = extractJson(aiText);
            return NextResponse.json({ ...aiData, transcript: transcriptText });
        } else {
            // No transcript found — Groq doesn't support audio input like Gemini did
            console.log("[Phase 2] No transcript found. Audio fallback not available with Groq.");
            return NextResponse.json({
                error: "Unable to extract transcript from this video. It might be too long, private, or age-restricted. Try a video with subtitles/captions enabled."
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error("Critical Failure:", error);
        return NextResponse.json({ error: "Server encountered an error processing this request." }, { status: 500 });
    }
}

// Helper: yt-dlp Subtitles
async function fetchSubtitleWithYtDlp(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP_PATH, ['--dump-json', '--skip-download', '--write-auto-subs', '--sub-langs', 'en.*', url]);
        let data = "";
        proc.stdout.on('data', d => data += d);
        proc.on('close', async (code) => {
            if (code !== 0) return resolve("");
            try {
                const info = JSON.parse(data);
                const autoSubs = info.automatic_captions || {};
                const subs = info.subtitles || {};
                const enSubs = subs.en || autoSubs.en;
                if (!enSubs) return resolve("");
                const format = enSubs.find((f: any) => f.ext === 'json3') || enSubs[0];
                const res = await fetch(format.url);
                const json = await res.json();
                const text = json.events?.map((e: any) => e.segs ? e.segs.map((s: any) => s.utf8).join("") : "").join(" ") || "";
                resolve(text);
            } catch (e) { resolve(""); }
        });
    });
}

function extractJson(text: string) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
        return { summary: "Summary generation failed.", notes: text, transcript: "Transcript unavailable." };
    }
}
