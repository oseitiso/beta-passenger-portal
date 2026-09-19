export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#FF6B00]/15 flex items-center justify-center mx-auto mb-6">
          <span className="text-[#FF6B00] text-3xl font-black">B</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          B-ETA
        </h1>
        <p className="text-sm text-neutral-500 mt-2">
          Book your journey across Botswana
        </p>
        <p className="text-[10px] uppercase tracking-widest text-neutral-700 mt-8">
          Passenger Portal — Phase P1
        </p>
      </div>
    </main>
  );
}