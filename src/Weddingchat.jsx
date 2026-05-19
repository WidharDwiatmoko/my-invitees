import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Heart, X, Send, Loader2, Sparkles } from "lucide-react";
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ============================================================
// 🔑 GANTI INI dengan API key Gemini kamu
// Dapatkan gratis di: https://aistudio.google.com/apikey
// ============================================================
const GEMINI_API_KEY = "AIzaSyAaGuPbfJrXiXlWCLQ4aYYOxaD4z2257Lg";

// ============================================================
// SYSTEM PROMPT
// ============================================================
const SYSTEM_PROMPT = `Kamu adalah AI penyambut tamu untuk undangan pernikahan Refi Septiningtyas dan Widhar Dwiatmoko.

IDENTITAS:
- Kamu berbicara mewakili pasangan ini dengan gaya yang super casual, lucu, dan akrab — kayak teman lama yang nggak ketemu lama
- Panggil dirimu "kita" atau "gue" (mewakili Refi & Widhar secara santai)
- Jawab dalam Bahasa Indonesia gaul yang hangat, bukan formal
- Sesekali pakai bahasa Jawa ringan kalau relevan (lha, yo, ndak, loh) karena ini pernikahan di Kediri

INFO PENTING:
- Akad Nikah: Minggu, 30 Mei 2026, pukul 07:00–09:00 WIB
  Lokasi: Aula Kelurahan Doko, Jl. Dandang Gendis No.279, Sumber, Doko, Kec. Ngasem, Kabupaten Kediri
  Google Maps: https://maps.app.goo.gl/CB5adRU6wNCeUmtY6

- Resepsi (tamu Refi): Minggu, 30 Mei 2026, pukul 10:00 WIB - Selesai
  Lokasi: Aula Kelurahan Doko (sama kayak akad)

- Ngunduh Mantu (tamu Widhar): Sabtu, 31 Mei 2026, pukul 10:00 WIB - Selesai
  Lokasi: Kediaman Mempelai Pria, Jl. Gunung Agung No.189, Dermo, Kec. Mojoroto, Kota Kediri
  Google Maps: https://maps.app.goo.gl/RW5HRxhWbJjkT95q7

- Dress code: Bebas tapi sopan dan rapi. Nggak ada warna yang dilarang kok!
- Parkir: Ada kok, tenang aja
- Batas RSVP: 23 Mei 2026 pukul 23:59 — jangan sampai lupa ya!
- Rekening hadiah (kalau mau): BCA 0153953918 a.n. Widhar Dwiatmoko

TENTANG PASANGAN:
- Refi Septiningtyas — putri dari Bapak Moch. Taufik & Ibu Retno Anggraini, Burengan, Kediri
- Widhar Dwiatmoko — putra dari Alm. Bapak Sagi & Ibu Aminin, Dermo, Kediri
- Ketemunya di era digital, awal-awal canggung banget, lama-lama nyaman, dan setelah 2 tahun akhirnya mutusin buat halal 🎉

GAYA BICARA:
- Santai, akrab, kayak ngobrol sama bestie
- Boleh bercanda ringan, tapi tetap hangat dan nggak norak
- Kalau nggak tahu jawabannya, jujur aja dan saranin tanya langsung ke keluarga
- Respon SINGKAT — maksimal 3-4 kalimat. Nggak perlu panjang-panjang
- Pakai emoji sesekali tapi jangan lebay
- Jangan kaku, jangan terlalu formal
- JANGAN gunakan markdown, bold (**), bullet (*), atau formatting apapun. Tulis plain text biasa saja seperti chat WhatsApp.`;  // ← tambah ini

// ============================================================
// Suggested questions
// ============================================================
const SUGGESTED = [
  "Dress code-nya apa nih? 👗",
  "Cerita dong gimana bisa jadian 💕",
  "Lokasi acaranya di mana? 📍",
  "Boleh bawa anak/pasangan? 👨‍👩‍👧",
  "Deadline RSVP kapan? ⏰",
];

// ============================================================
// Typing Indicator
// ============================================================
const TypingDots = () => (
  <div className="flex gap-1 items-center h-4 px-1">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-1.5 h-1.5 bg-slate-400 rounded-full"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }}
      />
    ))}
  </div>
);

// ============================================================
// Rate limiter — Firestore, max 3 chat per 4 jam per tamu
// ============================================================
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 jam

const checkRateLimit = async (guestName) => {
  const ref = doc(db, 'ai_rate_limits', guestName);
  const snap = await getDoc(ref);

  const now = Date.now();

  if (snap.exists()) {
    const { count, firstAt } = snap.data();
    const firstAtMs = firstAt.toMillis();
    const elapsed = now - firstAtMs;

    // Sudah lewat 4 jam → reset
    if (elapsed > RATE_WINDOW_MS) {
      await setDoc(ref, { count: 1, firstAt: serverTimestamp() });
      return { allowed: true, remaining: RATE_LIMIT - 1 };
    }

    // Masih dalam window, cek limit
    if (count >= RATE_LIMIT) {
      const resetIn = Math.ceil((RATE_WINDOW_MS - elapsed) / 60000);
      return { allowed: false, resetIn };
    }

    // Masih boleh, increment
    await updateDoc(ref, { count: count + 1 });
    return { allowed: true, remaining: RATE_LIMIT - count - 1 };
  }

  // Belum ada data → buat baru
  await setDoc(ref, { count: 1, firstAt: serverTimestamp() });
  return { allowed: true, remaining: RATE_LIMIT - 1 };
};

// ============================================================
// Kirim pesan ke Gemini API
// ============================================================

async function sendToGemini(history) {
  const res = await fetch(
    "https://weddingaichat-qomrrcjcla-uc.a.run.app",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ history }),
    }
  );

  if (!res.ok) {
    throw new Error("AI-nya lagi ngambek 😭 Coba bentar lagi ya");
  }

  const data = await res.json();

  return data.reply;
}

// ============================================================
// Main Component
// ============================================================
export default function WeddingAIChat({ guestName = "Tamu" }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggested, setShowSuggested] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const [cooldownMinutes, setCooldownMinutes] = useState(0);

  // Cek cooldown saat pertama kali load
  useEffect(() => {
    const checkInitialCooldown = async () => {
      try {
        const ref = doc(db, 'ai_rate_limits', guestName);
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
          const { count, firstAt } = snap.data();
          const firstAtMs = firstAt.toMillis();
          const elapsed = Date.now() - firstAtMs;
          
          if (elapsed < RATE_WINDOW_MS && count >= RATE_LIMIT) {
            const resetIn = Math.ceil((RATE_WINDOW_MS - elapsed) / 60000);
            setCooldownMinutes(resetIn);
          }
        }
      } catch (err) {
        console.warn('Failed to check initial cooldown', err);
      }
    };

    if (guestName) checkInitialCooldown();
  }, [guestName]);

  // Pop-up otomatis — jangan buka kalau sedang cooldown
  useEffect(() => {
    const t = setTimeout(() => {
      if (!dismissed && cooldownMinutes === 0) {
        setShowNudge(true);

        // preload greeting biar pas dibuka udah ada isi
        if (messages.length === 0) {
          setMessages([
            {
              role: "assistant",
              content: `Heyy ${guestName}! 👋 Kalau males baca detail undangan satu-satu, langsung tanya aja ke gue 😄`,
            },
          ]);
        }
      }
    }, 3500);

    return () => clearTimeout(t);
  }, [dismissed, guestName, cooldownMinutes]);

  // Nudge kecil kalau chat ditutup dan belum tanya apa-apa
  useEffect(() => {
    // hanya jalan setelah user pernah nutup chat
    if (!dismissed) return;

    if (!open && messages.length <= 1 && cooldownMinutes === 0) {
      const t = setTimeout(() => setShowNudge(true), 8000);
      return () => clearTimeout(t);
    }

    if (open) {
      setShowNudge(false);
    }
  }, [open, dismissed, messages.length, cooldownMinutes]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 400);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    // ── Cek rate limit ──
    setLoading(true);
    try {
      const { allowed, resetIn } = await checkRateLimit(guestName);
      if (!allowed) {
        setCooldownMinutes(resetIn); // ← simpan sisa waktu
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: 
              `Wah AI-nya capek 😭\n\n` +
              `Kita bukan orang mampu gaes, AI nya kita batasin 🙏 ` +
              `Coba lagi ${resetIn} menit lagi ya wkwk`,
          },
        ]);
        setLoading(false);
        return;
      }
    } catch {
      // Kalau Firestore error, tetap lanjut (jangan block user)
      console.warn('Rate limit check failed, skipping');
    }

    setShowSuggested(false);
    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setInput("");

    try {
      // const reply = await sendToGemini(newMessages, SYSTEM_PROMPT);
      const reply = await sendToGemini(newMessages);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error("Gemini error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.message?.includes("API_KEY")
            ? "API key-nya belum diisi nih 🙏 Hubungi pengelola undangan ya!"
            : "Koneksinya lagi ngadat nih 😅 Coba beberapa saat lagi ya!",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  const handleClose = () => {
    setOpen(false);
    setDismissed(true);
  };

  const handleReopen = () => {
    if (cooldownMinutes > 0) return;

    setOpen(true);
    setShowNudge(false);
    setDismissed(true);
  };

  return (
    <>
      {/* ── Nudge bubble ── */}
      <AnimatePresence>
        {showNudge && !open && (
          <motion.button
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.9 }}
            onClick={handleReopen}
            className="fixed bottom-24 right-4 z-[89] bg-slate-900 text-white text-[12px] px-4 py-3 rounded-2xl shadow-xl leading-snug text-left max-w-[200px]"
          >
            <span className="block font-medium mb-0.5">Kalau males baca, tanya gue aja 😄</span>
            <span className="text-slate-400 text-[10px]">dress code, lokasi, RSVP, dll</span>
            <div className="absolute -bottom-2 right-6 border-8 border-transparent border-t-slate-900" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Floating re-open button ── */}
      <AnimatePresence>
        {!open && !showNudge && (
          <>
            {/* Cooldown Bubble */}
            {cooldownMinutes > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                className="fixed bottom-40 right-4 z-[90]"
              >
                <div className="relative bg-slate-900 text-white text-[11px] px-3 py-2 rounded-2xl shadow-xl leading-tight max-w-[220px]">
                  <p className="font-medium">
                    Budget nikahan cuman mampu sewa AI honorer 😄
                  </p>

                  <p className="text-slate-300 mt-1">
                    Balik lagi{" "}
                    <span className="font-semibold text-white">
                      {cooldownMinutes} menit
                    </span>{" "}
                    ya bestie 🙏
                  </p>

                  {/* bubble tail */}
                  <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-slate-900 rotate-45" />
                </div>
              </motion.div>
            )}

            {/* Floating Button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={cooldownMinutes > 0 ? {} : { scale: 0.9 }}
              whileHover={cooldownMinutes > 0 ? {} : { scale: 1.08 }}
              onClick={handleReopen}
              disabled={cooldownMinutes > 0}
              className={`fixed bottom-24 right-4 z-[89] w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all
                ${
                  cooldownMinutes > 0
                    ? "bg-slate-400 cursor-not-allowed opacity-80"
                    : "bg-slate-900 shadow-slate-900/25 text-white"
                }`}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </motion.button>
          </>
        )}
      </AnimatePresence>
      {/* ── Main Pop-up ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[88] bg-black/10 backdrop-blur-[1px] md:hidden"
              onClick={handleClose}
            />

            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 32, scale: 0.94 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="fixed bottom-6 right-4 left-4 md:left-auto md:right-6 md:w-[380px] z-[89] flex flex-col rounded-3xl overflow-hidden shadow-2xl shadow-slate-900/20 border border-slate-100 bg-white"
              style={{ maxHeight: "75vh" }}
            >
              {/* Header */}
              <div className="bg-slate-900 px-5 py-4 flex items-center gap-3 shrink-0">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-200 to-pink-100 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-rose-500 fill-rose-400" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm leading-tight">Refi & Widhar</p>
                  <p className="text-slate-400 text-[10px] tracking-wide">Online</p>
                </div>
                <button
                  onClick={handleClose}
                  className="text-slate-500 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#faf9f7]">
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center shrink-0 mt-auto">
                        <Heart className="w-3 h-3 text-rose-300 fill-rose-200" />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "whitespace-pre-wrap break-words bg-slate-900 text-white rounded-br-sm"
                          : "whitespace-pre-wrap break-all bg-white text-slate-700 rounded-bl-sm border border-slate-100 shadow-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                ))}

                {loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-end gap-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                      <Heart className="w-3 h-3 text-rose-300 fill-rose-200" />
                    </div>
                    <div className="bg-white border border-slate-100 shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm">
                      <TypingDots />
                    </div>
                  </motion.div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Suggested Questions */}
              <AnimatePresence>
                {showSuggested && messages.length <= 1 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 pt-2 pb-1 flex gap-2 overflow-x-auto bg-[#faf9f7] shrink-0"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {SUGGESTED.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="shrink-0 text-[11px] px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all whitespace-nowrap"
                      >
                        {q}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input */}
              <div className="px-4 py-3 border-t border-slate-100 bg-white flex gap-2 items-center shrink-0">
                {cooldownMinutes > 0 ? (
                  // Tampilkan cooldown notice, bukan input
                  <div className="flex-1 text-center py-2">
                    <p className="text-[11px] text-slate-400">
                      🙏 Maaf ya, kamu bisa chat lagi dalam <span className="font-semibold text-slate-600">{cooldownMinutes} menit</span>
                    </p>
                  </div>
                ) : (
                  <>
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())
                      }
                      placeholder="Tanya apa aja..."
                      className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                      disabled={loading}
                    />
                    <motion.button
                      onClick={() => sendMessage()}
                      disabled={!input.trim() || loading}
                      whileTap={{ scale: 0.88 }}
                      className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </motion.button>
                  </>
                )}
              </div>

              {/* Footer kecil */}
              <div className="text-center py-2 bg-white border-t border-slate-50">
                <p className="text-[9px] text-slate-300 tracking-wide">Powered by Dana Ortu 😄</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}