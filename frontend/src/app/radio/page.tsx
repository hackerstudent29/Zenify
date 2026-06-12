"use client";

import { Construction, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function PlaceholderPage() {
 const router = useRouter();

 return (
 <div className="flex flex-col items-center justify-center h-[80vh] gap-6 px-6 text-center">
 <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
 <Construction className="text-violet-500 w-8 h-8" />
 </div>
 <div className="space-y-2">
 <h2 className="text-lg font-bold text-white uppercase tracking-widest">Under Construction</h2>
 <p className="text-xs text-white/40 max-w-xs leading-relaxed uppercase tracking-wider font-bold">
 The Archive is currently expanding. This sector will be online shortly.
 </p>
 </div>
 <Button
 variant="outline"
 onClick={() => router.push('/')}
 className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10 group"
 >
 <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
 Return to Command
 </Button>
 </div>
 );
}
