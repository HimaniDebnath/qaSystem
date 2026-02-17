"use client";

import { useState, useEffect, useRef } from "react";

interface Document {
    id: string;
    fileName: string;
    fileType: string;
    createdAt: string;
}

export default function DocumentQA() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [loadingQA, setLoadingQA] = useState(false);
    const [question, setQuestion] = useState("");
    const [qaHistory, setQaHistory] = useState<{ question: string; answer: string }[]>([]);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const res = await fetch("/api/documents/list");
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        } catch (err) {
            console.error("Failed to fetch documents", err);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError("");

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/documents/upload", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (res.ok) {
                setDocuments((prev) => [data, ...prev]);
                setSelectedDocId(data.id);
                setQaHistory([]);
            } else {
                setError(data.error || "Upload failed");
            }
        } catch (err) {
            setError("An error occurred during upload");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleAskQuestion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDocId || !question.trim() || loadingQA) return;

        const currentQuestion = question;
        setQuestion("");
        setLoadingQA(true);
        setError("");

        try {
            const res = await fetch("/api/documents/qa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: selectedDocId, question: currentQuestion }),
            });

            const data = await res.json();

            if (res.ok) {
                setQaHistory((prev) => [...prev, { question: currentQuestion, answer: data.answer }]);
            } else {
                setError(data.error || "Failed to get answer");
                setQuestion(currentQuestion); // Put it back if it failed
            }
        } catch (err) {
            setError("An error occurred during QA");
            setQuestion(currentQuestion);
        } finally {
            setLoadingQA(false);
        }
    };

    const selectedDoc = documents.find(d => d.id === selectedDocId);

    return (
        <div className="flex flex-col h-[700px] border border-gray-700 rounded-xl overflow-hidden bg-gray-900 shadow-2xl">
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar: Documents List */}
                <div className="w-64 border-r border-gray-700 bg-gray-800/50 flex flex-col">
                    <div className="p-4 border-b border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Your Documents</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {documents.length === 0 ? (
                            <p className="text-gray-500 text-xs p-4 text-center">No documents yet.</p>
                        ) : (
                            documents.map((doc) => (
                                <button
                                    key={doc.id}
                                    onClick={() => {
                                        setSelectedDocId(doc.id);
                                        setQaHistory([]);
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${selectedDocId === doc.id
                                        ? "bg-blue-600 text-white shadow-lg"
                                        : "text-gray-400 hover:bg-gray-700 hover:text-white"
                                        }`}
                                >
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="truncate">{doc.fileName}</span>
                                </button>
                            ))
                        )}
                    </div>
                    <div className="p-4 border-t border-gray-700 bg-gray-800/80">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                            accept=".pdf,.txt"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {uploading ? (
                                <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                            )}
                            {uploading ? "Uploading..." : "Upload File"}
                        </button>
                    </div>
                </div>

                {/* Main Area: Chat/QA */}
                <div className="flex-1 flex flex-col bg-gray-900">
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/30 backdrop-blur-sm">
                        <div>
                            <h2 className="text-lg font-semibold text-white">
                                {selectedDoc ? `Chat with ${selectedDoc.fileName}` : "Select a document"}
                            </h2>
                            {selectedDoc && (
                                <p className="text-xs text-gray-500">
                                    {selectedDoc.fileType?.split("/")[1]?.toUpperCase() || "UNKNOWN"} • {new Date(selectedDoc.createdAt).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                        {!selectedDocId ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-600">
                                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-medium text-white mb-2">Ready to analyze?</h3>
                                <p className="text-gray-400 max-w-sm">
                                    Upload a PDF or TXT file and ask questions about its content. Our AI will help you find specific information instantly.
                                </p>
                            </div>
                        ) : qaHistory.length === 0 && !loadingQA ? (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 max-w-sm">
                                    <p className="text-blue-400 text-sm">
                                        Ask a question about <b>{selectedDoc?.fileName}</b> to get started.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {qaHistory.map((qa, i) => (
                                    <div key={i} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex justify-end">
                                            <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-none max-w-[80%] shadow-lg">
                                                <p className="text-sm">{qa.question}</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-start">
                                            <div className="bg-gray-800 border border-gray-700 text-gray-200 px-4 py-3 rounded-2xl rounded-tl-none max-w-[90%] shadow-md prose prose-invert prose-sm">
                                                {qa.answer}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {loadingQA && (
                                    <div className="flex justify-start animate-pulse">
                                        <div className="bg-gray-800 border border-gray-700 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                                            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        {error && (
                            <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-xs text-center animate-in fade-in">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-gray-700 bg-gray-800/30">
                        <form onSubmit={handleAskQuestion} className="relative flex items-center gap-2">
                            <input
                                type="text"
                                placeholder={selectedDocId ? "Ask a question about this document..." : "Select a document first"}
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                disabled={!selectedDocId || loadingQA}
                                className="flex-1 bg-gray-900 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all shadow-inner"
                            />
                            <button
                                type="submit"
                                disabled={!selectedDocId || !question.trim() || loadingQA}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition-all shadow-lg shadow-blue-900/40 disabled:bg-gray-700 disabled:shadow-none"
                            >
                                {loadingQA ? (
                                    <span className="animate-spin h-5 w-5 block border-2 border-white/30 border-t-white rounded-full" />
                                ) : (
                                    <svg className="w-5 h-5 font-bold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                )}
                            </button>
                        </form>
                        <p className="mt-2 text-[10px] text-gray-500 text-center">
                            AI-generated responses. Always verify important information.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
