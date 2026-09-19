import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-[#FF6B00]/15 flex items-center justify-center mx-auto mb-6">
          <span className="text-[#FF6B00] text-3xl font-black">B</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          B-ETA
        </h1>
        <p className="text-sm text-neutral-500 mt-2">
          Book your journey across Botswana
        </p>

        <Link
          href="/map"
          className="inline-flex items-center justify-center gap-2 mt-10 px-6 py-3.5 bg-[#FF6B00] hover:bg-[#CC5500] text-white font-bold uppercase tracking-widest rounded-xl text-xs transition-colors"
        >
          <MapPin size={14} strokeWidth={2.25} />
          View Live Buses
          <ArrowRight size={14} strokeWidth={2.25} />
        </Link>

        <p className="text-[10px] uppercase tracking-widest text-neutral-700 mt-12">
          Passenger Portal — Phase P2
        </p>
      </div>
    </main>
  );
}