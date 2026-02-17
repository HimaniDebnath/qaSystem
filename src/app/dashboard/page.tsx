import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminUserList from "@/components/dashboard/admin-user-list";
import YoutubeSummarizer from "@/components/dashboard/youtube-summarizer";
import DocumentQA from "@/components/dashboard/document-qa";
import Link from "next/link";
import SignOutButton from "@/components/auth/signout-button"; // I need to create this

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/signin");
    }

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="bg-gray-800 shadow">
                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold tracking-tight text-white">
                        Dashboard
                    </h1>
                    <div className="flex items-center space-x-4">
                        <span className="text-gray-300">
                            Welcome, {session.user.name} ({session.user.role})
                        </span>
                        <SignOutButton />
                    </div>
                </div>
            </header>
            <main>
                <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
                    {session.user.role === "admin" ? (
                        <div className="space-y-8">
                            <div>
                                <h2 className="text-2xl font-semibold leading-7 text-white">User Management</h2>
                                <p className="mt-1 text-sm leading-6 text-gray-400 border-b border-gray-800 pb-4">Approve or revoke user access.</p>
                                <AdminUserList />
                            </div>

                            <div className="pt-8 border-t border-gray-800">
                                <h2 className="text-2xl font-semibold leading-7 text-white mb-6">AI Tools</h2>
                                <div className="space-y-12">
                                    <section>
                                        <h3 className="text-lg font-medium text-gray-300 mb-4">YouTube Summarizer</h3>
                                        <YoutubeSummarizer />
                                    </section>
                                    <section className="pt-8 border-t border-gray-800">
                                        <h3 className="text-lg font-medium text-gray-300 mb-4">Document QA</h3>
                                        <DocumentQA />
                                    </section>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className="rounded-md bg-white/5 p-4 ring-1 ring-inset ring-white/10">
                                <h3 className="text-lg font-medium text-white">Welcome back, {session.user.name}!</h3>
                                <p className="mt-2 text-gray-400">
                                    You can now use our AI tools to summarize and learn from YouTube videos.
                                </p>
                            </div>

                            <div>
                                <h2 className="text-2xl font-semibold leading-7 text-white mb-6">AI Tools</h2>
                                <div className="space-y-12">
                                    <section>
                                        <h3 className="text-lg font-medium text-gray-300 mb-4">YouTube Summarizer</h3>
                                        <YoutubeSummarizer />
                                    </section>
                                    <section className="pt-8 border-t border-gray-800">
                                        <h3 className="text-lg font-medium text-gray-300 mb-4">Document QA</h3>
                                        <DocumentQA />
                                    </section>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
