"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ListMusic, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const GENRES = [
    "Pop", "Rock", "Hip Hop", "R&B", "Jazz", "Classical",
    "Electronic", "Country", "Folk", "Indie", "Metal",
    "Reggae", "Soul", "Latin", "Soundtrack", "Alternative",
    "Dance", "Blues", "Funk", "Punk", "Disco", "Techno",
    "House", "Ambient", "Trap", "K-Pop", "J-Pop", "Lo-Fi"
].sort();

interface MetadataFormProps {
    formData: {
        title: string;
        artistName: string;
        genre: string;
        description: string;
        lyrics: string;
    };
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    setFormData: React.Dispatch<React.SetStateAction<any>>;
}

export function MetadataForm({ formData, handleInputChange, setFormData }: MetadataFormProps) {
    return (
        <div className="space-y-8 py-4">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-accent" />
                Track Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-zinc-300">Title <span className="text-red-500">*</span></Label>
                    <Input
                        id="title"
                        name="title"
                        placeholder="e.g. Blinding Lights"
                        value={formData.title}
                        onChange={handleInputChange}
                        className="bg-black/40 border-white/20 h-12 text-lg focus:border-accent font-medium text-white placeholder:text-zinc-500"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="artistName" className="text-xs font-bold uppercase tracking-wider text-zinc-300">Artist <span className="text-red-500">*</span></Label>
                    <Input
                        id="artistName"
                        name="artistName"
                        placeholder="e.g. The Weeknd"
                        value={formData.artistName}
                        onChange={handleInputChange}
                        className="bg-black/40 border-white/20 h-12 text-lg focus:border-accent font-medium text-white placeholder:text-zinc-500"
                        required
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="genre" className="text-xs font-bold uppercase tracking-wider text-zinc-300">Genre</Label>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                "w-full flex items-center justify-between bg-black/40 border border-white/20 rounded-md h-12 px-4 text-base font-medium transition-colors hover:bg-black/60 hover:border-white/40 focus:outline-none focus:ring-1 focus:ring-accent",
                                !formData.genre ? "text-zinc-500" : "text-white"
                            )}
                        >
                            {formData.genre || "Select Genre"}
                            <ChevronDown className="h-4 w-4 opacity-70" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[var(--radix-popper-anchor-width)] max-h-[300px] overflow-y-auto bg-zinc-900 border border-white/20 text-zinc-200 rounded-lg shadow-xl py-1 z-50"
                        align="start"
                        sideOffset={5}
                    >
                        {GENRES.map((genre) => (
                            <DropdownMenuItem
                                key={genre}
                                onClick={() => setFormData((prev: any) => ({ ...prev, genre: genre }))}
                                className="focus:bg-accent focus:text-white cursor-pointer py-2.5 px-4 text-sm font-medium transition-colors"
                            >
                                {genre}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="space-y-2">
                <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-zinc-300">Description</Label>
                <Textarea
                    id="description"
                    name="description"
                    placeholder="Add a short description about this track..."
                    value={formData.description}
                    onChange={handleInputChange}
                    className="bg-black/40 border-white/20 rounded-md py-3 text-base min-h-[100px] resize-none text-white placeholder:text-zinc-500 focus:border-accent focus:ring-1 focus:ring-accent"
                />
            </div>

            <div className="space-y-4">
                <Label htmlFor="lyrics" className="text-xs font-bold uppercase tracking-wider text-zinc-300">Lyrics</Label>
                <Textarea
                    id="lyrics"
                    name="lyrics"
                    placeholder="[00:10.00] Synced lyrics here..."
                    value={formData.lyrics}
                    onChange={handleInputChange}
                    className="bg-black/40 border-white/20 rounded-md py-3 text-sm font-mono min-h-[100px] resize-none text-zinc-200 placeholder:text-zinc-600 focus:border-accent focus:ring-1 focus:ring-accent"
                />
            </div>
        </div>
    );
}
