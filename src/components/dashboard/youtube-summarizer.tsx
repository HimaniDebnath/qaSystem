"use client";


import { useState, useEffect } from "react";

export default function YoutubeSummarizer() {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<{ summary: string; notes: string; transcript?: string } | null>(null);
    const [videoId, setVideoId] = useState("");
    const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (retryCountdown !== null && retryCountdown > 0) {
            timer = setTimeout(() => setRetryCountdown(retryCountdown - 1), 1000);
        } else if (retryCountdown === 0) {
            handleSummarize(true);
        }
        return () => clearTimeout(timer);
    }, [retryCountdown]);

    const extractVideoId = (url: string) => {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    };

    const handleSummarize = async (isRetry = false) => {
        if (!isRetry) {
            setError("");
            setResult(null);
            setVideoId("");
        }
        setLoading(true);
        setRetryCountdown(null);
        setIsRetrying(isRetry);

        const extractedId = extractVideoId(url);
        if (extractedId) setVideoId(extractedId);

        try {
            const response = await fetch("/api/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });

            let data;
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse JSON response:", text);
                throw new Error("Server returned an invalid response. This usually happens when the deployment is still stabilizing or a hard error occurred.");
            }

            if (!response.ok) {
                if (response.status === 429) {
                    setRetryCountdown(30); // 30 seconds cooldown
                    // If the response contains a transcript, show it!
                    if (data.transcript) {
                        setResult(data);
                    }
                    throw new Error(data.error || "Rate limit reached. Retrying...");
                }
                if (response.status === 504) {
                    throw new Error("The request timed out. This often happens on Vercel with long videos. Please try a shorter video (under 5 mins).");
                }
                throw new Error(data.error || "Failed to summarize video. The video might be restricted or too long.");
            }

            setResult(data);
            setRetryCountdown(null); // Clear retry if successful
        } catch (err: any) {
            // Only set error if we aren't initiating a retry
            // We check the error message or a flag, since retryCountdown state update is async
            if (!err.message.includes("Retrying...")) {
                setError(err.message);
            }
        } finally {
            if (retryCountdown === null) {
                setLoading(false);
                setIsRetrying(false);
            }
        }
    };

    const cancelRetry = () => {
        setRetryCountdown(null);
        setLoading(false);
        setIsRetrying(false);
        setError("Retry cancelled.");
    };

    return (
        <div className="space-y-6">
            <div className="rounded-xl bg-gray-800/50 p-6 border border-gray-700 shadow-xl backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white mb-4">AI YouTube Summarizer</h2>
                <p className="text-gray-400 mb-6 text-sm">
                    Paste a YouTube link below to generate a concise summary and structured study notes using AI.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                    <input
                        type="text"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1 px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-gray-600"
                    />
                    <button
                        onClick={() => retryCountdown !== null ? cancelRetry() : handleSummarize()}
                        disabled={loading && retryCountdown === null}
                        className={`px-6 py-2.5 font-medium rounded-lg transition-colors shadow-lg flex items-center justify-center min-w-[150px]
                            ${retryCountdown !== null
                                ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                                : "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white shadow-blue-900/20"
                            }`}
                    >
                        {retryCountdown !== null ? (
                            <span>Cancel Retry ({retryCountdown}s)</span>
                        ) : loading ? (
                            <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {isRetrying ? "Retrying..." : "Processing..."}
                            </span>
                        ) : "Summarize"}
                    </button>
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}
            </div>

            {/* Video Player */}
            {videoId && (
                <div className="mb-8 rounded-xl overflow-hidden border border-gray-700 shadow-lg">
                    <iframe
                        className="w-full aspect-video"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    ></iframe>
                </div>
            )}

            {retryCountdown !== null && (
                <div className="rounded-lg bg-yellow-900/20 border border-yellow-500/50 p-4 animate-pulse">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <p className="text-yellow-400 text-sm font-medium flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Usage limit reached. Waiting for quota cooldown... (Resuming in {retryCountdown}s)
                        </p>
                        <button
                            onClick={() => handleSummarize(true)}
                            className="px-4 py-1.5 bg-yellow-600/50 hover:bg-yellow-600 text-yellow-100 text-xs font-bold rounded-md transition-colors border border-yellow-500/50"
                        >
                            Retry Now
                        </button>
                    </div>
                </div>
            )}

            {result && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Summary Section */}
                    <div className="rounded-xl bg-gray-800/50 p-6 border border-gray-700 shadow-xl backdrop-blur-sm">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Video Summary
                        </h3>
                        <div className="prose prose-invert max-w-none text-gray-300 text-sm leading-relaxed">
                            {result.summary.split('\n').map((para, i) => (
                                <p key={i} className="mb-3">{para}</p>
                            ))}
                        </div>
                    </div>

                    {/* Study Notes Section */}
                    <div className="rounded-xl bg-gray-800/50 p-6 border border-gray-700 shadow-xl backdrop-blur-sm">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Study Notes
                        </h3>
                        <div className="prose prose-invert max-w-none text-gray-300 text-sm notes-content">
                            <div className="whitespace-pre-wrap font-sans">
                                {result.notes}
                            </div>
                        </div>
                    </div>

                    {/* Transcript Section */}
                    {result.transcript && (
                        <div className="col-span-1 lg:col-span-2 rounded-xl bg-gray-800/50 p-6 border border-gray-700 shadow-xl backdrop-blur-sm">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                                <svg className="w-5 h-5 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                                Full Transcript
                            </h3>
                            <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                                    {result.transcript}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
