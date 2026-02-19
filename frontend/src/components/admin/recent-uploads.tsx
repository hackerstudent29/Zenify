"use client";
import { format } from 'date-fns';

interface RecentUploadsListProps {
    tracks: any[];
}

export function RecentUploadsList({ tracks }: RecentUploadsListProps) {
    if (!tracks || tracks.length === 0) {
        return (
            <div className="text-center py-12 border border-dashed border-white/5 rounded-xl bg-zinc-900/30">
                <p className="text-zinc-500 text-sm">No tracks uploaded yet. Start by adding one above.</p>
            </div>
        );
    }

    return (
        <div className="w-full overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 text-xs font-bold uppercase tracking-wider text-zinc-500 text-left">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-1"></div>
                <div className="col-span-4">Title</div>
                <div className="col-span-3">Artist</div>
                <div className="col-span-2 hidden md:block">Genre</div>
                <div className="col-span-1 text-right">Date</div>
            </div>

            <div className="divide-y divide-white/5">
                {tracks.map((track, i) => (
                    <div key={track.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors group text-sm text-left">
                        <div className="col-span-1 text-center text-zinc-600 font-mono text-xs">{i + 1}</div>

                        <div className="col-span-1">
                            <div className="relative w-10 h-10 bg-zinc-800 rounded overflow-hidden">
                                <img
                                    src={track.coverUrl?.startsWith('http') ? track.coverUrl : `http://localhost:3000${track.coverUrl || ''}`}
                                    alt={track.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>

                        <div className="col-span-4 min-w-0">
                            <div className="font-medium text-zinc-200 truncate group-hover:text-white transition-colors">{track.title}</div>
                        </div>

                        <div className="col-span-3 min-w-0">
                            <div className="text-zinc-500 truncate">{track.artist?.name || track.artistName}</div>
                        </div>

                        <div className="col-span-2 hidden md:block">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/5 text-zinc-400 border border-white/5">
                                {track.genre || "Unknown"}
                            </span>
                        </div>

                        <div className="col-span-1 text-right text-zinc-600 text-xs tabular-nums">
                            {format(new Date(track.createdAt), 'MMM d')}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
