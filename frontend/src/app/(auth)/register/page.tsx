"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const router = useRouter();

    useEffect(() => {
        // Simple redirect to the unified auth page (which defaults to login, user can click signup)
        // Or we could pass a query param ?tab=signup but the current login page doesn't read it yet.
        // For now just redirect.
        router.replace("/login");
    }, [router]);

    return null;
}
