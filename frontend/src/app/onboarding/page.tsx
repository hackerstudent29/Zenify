"use client";

import Stepper, { Step } from '@/components/ui/stepper';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Music, User, Check, Palette } from 'lucide-react';
import api from '@/lib/api';

const GENRES = [
    "Pop", "Rock", "Hip Hop", "R&B", "Jazz", "Classical", "Electronic", "Indie", "K-Pop", "Metal"
];

export default function OnboardingPage() {
    const { user, login } = useAuthStore();
    const router = useRouter();
    const [name, setName] = useState(user?.email?.split('@')[0] || '');
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const toggleGenre = (genre: string) => {
        if (selectedGenres.includes(genre)) {
            setSelectedGenres(selectedGenres.filter(g => g !== genre));
        } else {
            if (selectedGenres.length < 5) {
                setSelectedGenres([...selectedGenres, genre]);
            }
        }
    };

    const handleComplete = async () => {
        setLoading(true);
        try {
            // Update user profile/preferences
            // Assuming we have an endpoint for this, or using the updatePreferences we saw earlier
            await api.put('/auth/preferences', {
                onboardingCompleted: true,
                preferredGenres: selectedGenres,
                displayName: name
            });

            // Redirect to home
            router.push('/');
        } catch (error) {
            console.error("Onboarding failed", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-4xl">
                <Stepper
                    initialStep={1}
                    onFinalStepCompleted={handleComplete}
                    backButtonText="Back"
                    nextButtonText="Next"
                    stepCircleContainerClassName="glass"
                >
                    <Step>
                        <div className="flex flex-col items-center text-center space-y-6 py-8">
                            <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mb-4">
                                <User className="w-8 h-8 text-accent" />
                            </div>
                            <h2 className="text-3xl font-bold">Welcome to Zenify!</h2>
                            <p className="text-zinc-400 max-w-md">Let's get your profile set up so you can start listening to music that matches your vibe.</p>

                            <div className="w-full max-w-xs space-y-2 text-left">
                                <label className="text-sm font-medium text-zinc-300 ml-1">What should we call you?</label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your Name"
                                    className="bg-black/20 border-white/10 h-12 text-lg"
                                    autoFocus
                                />
                            </div>
                        </div>
                    </Step>

                    <Step>
                        <div className="flex flex-col items-center text-center space-y-6 py-8">
                            <div className="w-16 h-16 bg-pink-500/20 rounded-full flex items-center justify-center mb-4">
                                <Music className="w-8 h-8 text-pink-500" />
                            </div>
                            <h2 className="text-3xl font-bold">Pick Your Taste</h2>
                            <p className="text-zinc-400 max-w-md">Select up to 5 genres you enjoy. We'll tune your recommendations.</p>

                            <div className="flex flex-wrapjustify-center gap-3 mt-4 max-w-lg mx-auto">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                                    {GENRES.map(genre => (
                                        <button
                                            key={genre}
                                            onClick={() => toggleGenre(genre)}
                                            className={`
                                                relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border
                                                ${selectedGenres.includes(genre)
                                                    ? 'bg-accent text-white border-accent shadow-glow'
                                                    : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-white'}
                                            `}
                                        >
                                            {genre}
                                            {selectedGenres.includes(genre) && (
                                                <div className="absolute top-1 right-1">
                                                    <Check className="w-3 h-3" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p className="text-xs text-zinc-500 mt-2">{selectedGenres.length} / 5 selected</p>
                        </div>
                    </Step>

                    <Step>
                        <div className="flex flex-col items-center text-center space-y-6 py-8">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                                <Check className="w-8 h-8 text-emerald-500" />
                            </div>
                            <h2 className="text-3xl font-bold">You're All Set, {name}!</h2>
                            <p className="text-zinc-400 max-w-md">Your profile is ready. Dive in and experience the future of music streaming.</p>

                            <div className="p-6 bg-white/5 rounded-2xl border border-white/5 w-full max-w-sm mt-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-lg">
                                        {name[0]?.toUpperCase()}
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-white text-lg">{name}</h3>
                                        <p className="text-zinc-500 text-sm">{selectedGenres.slice(0, 3).join(', ')} fan</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Step>
                </Stepper>
            </div>
        </div>
    );
}
