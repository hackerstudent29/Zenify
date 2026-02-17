"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function Home() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="space-y-4">
        <motion.h1
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent"
        >
          Welcome back
        </motion.h1>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {/* Quick Access Cards */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <motion.div
              key={i}
              variants={item}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="group relative flex items-center bg-white/5 hover:bg-white/10 transition rounded-md overflow-hidden cursor-pointer h-[80px]"
            >
              <div className="h-full w-[80px] bg-gradient-to-br from-primary/20 to-secondary shado-xl flex items-center justify-center">
                <span className="text-2xl">🎵</span>
              </div>
              <span className="px-4 font-semibold truncate text-white">Liked Songs</span>
              {/* Play Button on Hover */}
              <div className="absolute right-4 opacity-0 group-hover:opacity-100 transition duration-300 shadow-lg rounded-full bg-primary p-3 flex items-center justify-center translate-y-2 group-hover:translate-y-0">
                <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-black border-b-[6px] border-b-transparent ml-1" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Featured Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-white">Made for You</h2>
          <Button variant="link" className="text-sm text-zinc-400 hover:text-white transition-colors">Show all</Button>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              variants={item}
              className="group p-4 bg-zinc-900/40 hover:bg-zinc-800/60 rounded-md transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-black/20"
            >
              <div className="relative aspect-square mb-4 bg-zinc-800 rounded-md shadow-lg overflow-hidden group-hover:shadow-2xl transition-all">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-2 right-2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 shadow-lg rounded-full bg-primary p-3 flex items-center justify-center">
                  <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-black border-b-[6px] border-b-transparent ml-1" />
                </div>
              </div>
              <h3 className="font-semibold text-white truncate mb-1">Discover Weekly</h3>
              <p className="text-sm text-zinc-400 line-clamp-2">Weekly music suggestions tailored just for you.</p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  );
}
