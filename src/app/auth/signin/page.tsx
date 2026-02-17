import LoginForm from "@/components/auth/login-form";
import { Suspense } from "react";

export default function SignInPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900">
            <Suspense fallback={<div className="text-white">Loading...</div>}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
