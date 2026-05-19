/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useSpring, AnimatePresence, useAnimation } from 'motion/react';
import { 
  Heart, 
  Calendar, 
  MapPin, 
  Users, 
  ChevronDown,
  Clock,
  Send,
  ExternalLink,
  Download,
  Lock,
  Loader2,
  HelpCircle,
  X,
  Italic
} from 'lucide-react';
import { db, auth } from './firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, getFirestore, getDocFromServer, onSnapshot, orderBy, arrayUnion, arrayRemove } from 'firebase/firestore';
import WeddingAIChat from './Weddingchat';
import RequestStatusPage from './RequestStatusPage';


// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);


const Section = ({ children, className = "", id = "" }: { children: React.ReactNode, className?: string, id?: string }) => (
  <section id={id} className={`min-h-screen flex flex-col items-center justify-center relative px-4 py-16 md:px-6 md:py-24 overflow-hidden ${className}`}>
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      className="w-full flex flex-col items-center"
    >
      {children}
    </motion.div>
  </section>
);

const Countdown = ({ targetDate }: { targetDate: string }) => {
  const targetTime = new Date(targetDate).getTime();

  const calculateTimeLeft = () => {
    const now = Date.now();
    const difference = targetTime - now;

    if (difference <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  const TimeUnit = ({ value, label }: { value: number, label: string }) => (
    <div className="flex flex-col items-center">
      <div className="text-2xl md:text-3xl font-display font-bold text-slate-900 tabular-nums">
        {value.toString().padStart(2, '0')}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-display">{label}</div>
    </div>
  );

  return (
    <div className="flex justify-center gap-4 mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-100">
      <TimeUnit value={timeLeft.days} label="Hari" />
      <div className="text-slate-300 self-start mt-1">:</div>
      <TimeUnit value={timeLeft.hours} label="Jam" />
      <div className="text-slate-300 self-start mt-1">:</div>
      <TimeUnit value={timeLeft.minutes} label="Menit" />
      <div className="text-slate-300 self-start mt-1">:</div>
      <TimeUnit value={timeLeft.seconds} label="Detik" />
    </div>
  );
};

const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat Pagi';
  if (hour < 15) return 'Selamat Siang';
  if (hour < 19) return 'Selamat Sore';
  return 'Selamat Malam';
};

// ── Hitung kemiripan dua string (0-1) ──
const similarity = (a: string, b: string): number => {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  
  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter[i - 1] !== longer[j - 1]) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  return (longer.length - costs[longer.length]) / longer.length;
};

const InvitationGate = ({ onAccess, onShowStatusPage }: { onAccess: (guest: any) => void, onShowStatusPage?: () => void, key?: string }) => {
  const [requestSent, setRequestSent] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [receivedCode, setReceivedCode] = useState('');


  const [requestForm, setRequestForm] = useState({
  originalName: '',
  side: 'bride',
  note: '',
  });

  // const handleRequestInvitation = async () => {
  // try {
  //   setRequestLoading(true);

  //   const response = await fetch(
  //     'https://requestinvitation-qomrrcjcla-uc.a.run.app',
  //     {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         originalName: requestForm.originalName,
  //         side: requestForm.side,
  //         note: requestForm.note,
  //       }),
  //     }
  //   );

  //   const result = await response.json();

  //   setTimeout(() => {
  //     setShowRequestForm(false);
  //     setRequestLoading(false);
  //     setRequestSent(true);
  //     if (result.statusCode) setReceivedCode(result.statusCode);  // ← tambah ini
  //   }, 500);


  //   setError(
  //     'Permintaan undangan berhasil dikirim. Silakan tunggu dan coba lagi nanti ya :)'
  //   );
  // } catch (err) {
  //   console.error(err);
  //   setError('Terjadi kesalahan saat mengirim permintaan.');
  // } finally {
  //   setLoading(false);
  // }
  // };
  const handleRequestInvitation = async () => {
  try {
    setRequestLoading(true);
    setError('');

    const response = await fetch(
      'https://requestinvitation-qomrrcjcla-uc.a.run.app',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalName: requestForm.originalName,
          side: requestForm.side,
          note: requestForm.note,
        }),
      }
    );

    const result = await response.json();

    if (result.success) {
      setShowRequestForm(false);
      setRequestSent(true);
      if (result.statusCode) {
        setReceivedCode(result.statusCode); // <-- Berhasil menyimpan kode status (Contoh: REFI-1234)
      }
    } else {
      setError(result.message || 'Terjadi kesalahan saat mengirim permintaan.');
    }
  } catch (err) {
    console.error(err);
    setError('Terjadi kesalahan saat mengirim permintaan.');
  } finally {
    setRequestLoading(false);
    setLoading(false);
  }
};

  // const handleAccess = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   setLoading(true);
  //   setError('');

  //   try {
  //     const inputName = name.trim().toLowerCase();
  //     const firstName = inputName.split(' ')[0];

  //     // ── 1. Cari by name (nama depan) ──
  //     let querySnapshot = await getDocs(
  //       query(collection(db, 'guests'), where('name', '==', firstName))
  //     );

  //     // ── 2. Kalau tidak ketemu, ambil semua lalu filter by originalName ──
  //     if (querySnapshot.empty) {
  //       const allGuests = await getDocs(collection(db, 'guests'));
        
  //       const matched = allGuests.docs.filter(d => {
  //         const original = (d.data().originalName || '').toLowerCase();
  //         const dbName = (d.data().name || '').toLowerCase();
  //         // Cocok kalau salah satu kata di originalName mengandung inputName
  //         return original.split(' ').some((word: string) => word.startsWith(inputName)) 
  //           || original.includes(inputName)
  //           || dbName.startsWith(inputName);
  //       });

  //       if (matched.length === 0) {
  //         // Tidak ketemu sama sekali → request form

  //         const allGuests = await getDocs(collection(db, 'guests'));
  
  //         // Cari kandidat mirip dari name DAN semua kata di originalName
  //         type Suggestion = { id: string; displayName: string; score: number; data: any };
  //         const suggestions: Suggestion[] = [];

  //         allGuests.docs.forEach(d => {
  //           const data = d.data();
            
  //           // Kumpulkan semua kata yang bisa dicari
  //           const nameWords = (data.name || '').toLowerCase().split(' ');
  //           const originalWords = (data.originalName || '').toLowerCase().split(' ');
  //           const allWords = [...new Set([...nameWords, ...originalWords])];
            
  //           let bestScore = 0;
            
  //           allWords.forEach((word: string) => {
  //             if (!word) return;
              
  //             // ── Exact startsWith → score tinggi ──
  //             if (word.startsWith(inputName) || inputName.startsWith(word)) {
  //               bestScore = Math.max(bestScore, 0.85);
  //               return;
  //             }
              
  //             // ── Similarity untuk typo ──
  //             const score = similarity(inputName, word);
  //             bestScore = Math.max(bestScore, score);
  //           });
            
  //           if (bestScore >= 0.6 && bestScore < 1.0) {
  //             suggestions.push({
  //               id: d.id,
  //               displayName: data.originalName || data.name,
  //               score: bestScore,
  //               data,
  //             });
  //           }
  //         });

  //         if (suggestions.length > 0) {
  //           // Sort by score tertinggi
  //           suggestions.sort((a, b) => b.score - a.score);
  //           setSuggestions(suggestions.slice(0, 3)); // max 3 saran
  //           setLoading(false);
  //           return;
  //         }
  //         setRequestForm({ originalName: "", side: 'bride', note: '' });
  //         setShowRequestForm(true);
  //         setLoading(false);
  //         return;
  //       }

  //       if (matched.length > 1) {
  //         setDuplicates(matched.map(d => ({ id: d.id, ...d.data() })));
  //         setLoading(false);
  //         return;
  //       }

  //       // Tepat 1 → langsung masuk
  //       onAccess({ id: matched[0].id, ...matched[0].data() });
  //       setLoading(false);
  //       return;
  //     }

  //     // ── 3. Ketemu by name ──
  //     if (inputName.includes(' ')) {
  //       setError(`Gunakan nama depan saja ya 😊 Contoh: "${firstName}"`);
  //       setLoading(false);
  //       return;
  //     }

  //     if (querySnapshot.docs.length > 1) {
  //       setDuplicates(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  //       setLoading(false);
  //       return;
  //     }

  //     onAccess({ id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() });

  //   } catch (err) {
  //     console.error('Error checking guest:', err);
  //     setError('Terjadi kesalahan. Silakan coba lagi.');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuggestions([]);
    setDuplicates([]);

    try {
      const inputName = name.trim().toLowerCase();
      const firstName = inputName.split(' ')[0];

      if (inputName.includes(' ')) {
        setError(`Gunakan nama depan saja ya 😊 Contoh: "${firstName}"`);
        setLoading(false);
        return;
      }

      // ── 1. Ambil semua data tamu untuk pencarian fuzzy & multi-match ──
      // Catatan: Jika database kamu berskala ribuan, pertimbangkan query algolia/typesense.
      // Untuk undangan pernikahan (ratusan tamu), cara fetch all ini masih sangat aman.
      const allGuestsSnapshot = await getDocs(collection(db, 'guests'));
      
      const exactMatches: any[] = [];
      type Suggestion = { id: string; displayName: string; score: number; data: any };
      const fuzzySuggestions: Suggestion[] = [];

      allGuestsSnapshot.docs.forEach(d => {
        const data = d.data();
        const guestId = d.id;
        const guestData = { id: guestId, ...data };

        const dbName = (data.name || '').toLowerCase();
        const original = (data.originalName || '').toLowerCase();
        const originalWords = original.split(' ');

        // Cek exact match pada nama depan/panggilan
        if (dbName === inputName) {
          exactMatches.push(guestData);
          return; // Jika exact match, tidak perlu masuk list typo/fuzzy
        }

        // ── 2. Hitung skor kemiripan untuk nama yang mirip (Fuzzy Match) ──
        const allWords = [...new Set([dbName, ...originalWords])].filter(Boolean);
        let bestScore = 0;

        allWords.forEach((word: string) => {
          // Jika mengandung kata atau awalan yang mirip
          if (word.startsWith(inputName) || inputName.startsWith(word) || original.includes(inputName)) {
            bestScore = Math.max(bestScore, 0.85);
            return;
          }
          
          // Hitung Levenshtein/similarity distance
          const score = similarity(inputName, word);
          bestScore = Math.max(bestScore, score);
        });

        // Kriteria masuk sebagai rekomendasi/saran mirip
        if (bestScore >= 0.55) {
          fuzzySuggestions.push({
            id: guestId,
            displayName: data.originalName || data.name,
            score: bestScore,
            data: guestData,
          });
        }
      });

      // ── 3. Ambil Keputusan Berdasarkan Hasil Pencarian ──

      // Kasus A: Ada exact match di database
      if (exactMatches.length > 0) {
        // Gabungkan juga fuzzy suggestions yang skornya sangat tinggi (misal > 0.8) 
        // ke dalam modal duplikat, agar "Amel" vs "Amalia" bisa memilih
        const highConfidenceSuggestions = fuzzySuggestions
          .filter(s => s.score >= 0.8)
          .map(s => s.data);

        const totalOptions = [...exactMatches, ...highConfidenceSuggestions];

        // Hilangkan duplikasi objek berdasarkan ID jika ada
        const uniqueOptions = totalOptions.filter(
          (value, index, self) => self.findIndex(t => t.id === value.id) === index
        );

        if (uniqueOptions.length > 1) {
          setDuplicates(uniqueOptions);
          setLoading(false);
          return;
        }

        // Tepat hanya ada 1 pilihan pasti -> Langsung Beri Akses
        onAccess(uniqueOptions[0]);
        setLoading(false);
        return;
      }

      // Kasus B: Tidak ada exact match, tapi ada nama yang mirip (Fuzzy Suggestions)
      if (fuzzySuggestions.length > 0) {
        // Urutkan berdasarkan kemiripan tertinggi
        fuzzySuggestions.sort((a, b) => b.score - a.score);
        setSuggestions(fuzzySuggestions.slice(0, 3)); // Tampilkan max 3 saran
        setLoading(false);
        return;
      }

      // Kasus C: Benar-benar tidak ketemu sama sekali -> Lempar ke Request Form
      setRequestForm({ originalName: name, side: 'bride', note: '' });
      setShowRequestForm(true);

    } catch (err) {
      console.error('Error checking guest:', err);
      setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-cream-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        <Heart className="w-12 h-12 text-dusty-600 fill-dusty-100 mx-auto mb-8" />
        <h1 className="font-serif text-4xl font-bold mb-4 text-slate-900 italic">{getTimeGreeting()}{name.trim() ? `, ${capitalize(name.trim().split(' ')[0])}` : ''}</h1>
        <p className="text-slate-500 mb-10 font-light">Silakan masukkan nama kamu untuk membuka undangan.</p>
        
        <form onSubmit={handleAccess} className="space-y-6">
          <div className="relative">
            <input
              required
              type="text"
              className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-dusty-100 transition-all text-slate-900 text-center text-lg"
              placeholder="Nama depan/panggilan kamu (cth : roni, rosi)"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-rose-500 text-sm"
            >
              {error}
            </motion.p>
          )}
          {requestSent && receivedCode && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-5 bg-white rounded-2xl border border-slate-100 text-left space-y-3"
            >
              <p className="font-display text-[9px] uppercase tracking-wider text-slate-400">
                Kode Status Kamu
              </p>
              <p className="font-mono text-2xl font-bold text-slate-900 tracking-widest">
                {receivedCode}
              </p>
              <p className="text-[10px] text-slate-400 font-light leading-relaxed">
                Simpan kode ini untuk cek status permintaanmu kapanpun.
              </p>
                <a
                  href={`/?status&code=${receivedCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center w-full py-3 rounded-2xl border border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900 transition-all text-xs font-display uppercase tracking-wider"
                >
                  Cek Status Request →
                </a>
            </motion.div>
          )}

          <button
            disabled={loading}
            type="submit"
            className="w-full py-4 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 font-display font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-slate-200"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Mencari undangan kamu...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" /> Buka Undangan
              </>
            )}
          </button>
        </form>
<motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-8 text-center"
        >
          <button
            type="button"
            onClick={() => {
              window.history.pushState(null, '', '/?status');
              onShowStatusPage?.();
            }}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Sudah mengajukan akses?{' '}
            <span className="font-bold text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-900 transition-colors">
              Cek status di sini
            </span>
          </button>
        </motion.div>
      </motion.div>
      <AnimatePresence>
      {showRequestForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{
            opacity: showRequestForm ? 1 : 0
          }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-6"
        >
          <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md"
            >
            <h3 className="font-serif text-2xl italic text-slate-900 mb-2">
              Request Undangan
            </h3>

            <p className="text-slate-500 text-sm mb-6">
              Nama Anda belum terdaftar. Silakan isi data berikut.
            </p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                  Nama Lengkap
                </label>

                <input
                  type="text"
                  value={requestForm.originalName}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      originalName: e.target.value,
                    })
                  }
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                  Tamu Dari
                </label>

                <select
                  value={requestForm.side}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      side: e.target.value,
                    })
                  }
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3"
                >
                  <option value="bride">Refi</option>
                  <option value="groom">Widhar</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                  Keterangan
                </label>

                <textarea
                  rows={3}
                  placeholder="Contoh: teman sekolah, rekan kerja, saudara, dll"
                  value={requestForm.note}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      note: e.target.value,
                    })
                  }
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setShowRequestForm(false)}
                  className="
                    flex-1 py-3 rounded-2xl
                    border border-slate-200
                    text-slate-500
                    hover:bg-slate-50
                    transition-colors
                  "
                >
                  Batal
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  onClick={handleRequestInvitation}
                  disabled={requestLoading || !requestForm.originalName.trim()} // ← tambah ini
                  className="
                    flex-1 py-3 rounded-2xl
                    bg-slate-900 text-white
                    hover:bg-slate-800
                    disabled:opacity-50
                    transition-all
                  "
                >
                  {requestLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "Kirim"
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {duplicates.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-3xl p-8 w-full max-w-md"
          >
            <Heart className="w-8 h-8 text-dusty-600 fill-dusty-100 mx-auto mb-4" />
            <h3 className="font-serif text-2xl italic text-slate-900 mb-2 text-center">
              Ada beberapa "{capitalize(name.trim().split(' ')[0])}" nih
            </h3>
            <p className="text-slate-500 text-sm mb-6 text-center font-light">
              Pilih nama kamu yang mana ya 😊
            </p>

            <div className="space-y-3">
              {duplicates.map((d) => (
                <motion.button
                  key={d.id}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setDuplicates([]);
                    onAccess(d);
                  }}
                  className="w-full text-left px-5 py-4 rounded-2xl border border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition-all"
                >
                  <p className="font-semibold text-slate-900 capitalize">
                    {d.originalName || capitalize(d.name)} ({d.name})
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tamu dari {d.side === 'groom' ? 'Widhar' : 'Refi'}
                    {d.note ? ` · ${d.note}` : ''}
                  </p>
                </motion.button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setDuplicates([])}
              className="mt-5 w-full py-3 text-slate-400 text-sm hover:text-slate-600 transition-colors"
            >
              Bukan keduanya, coba nama lain
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-3xl p-8 w-full max-w-md"
          >
            <p className="text-2xl text-center mb-2">🤔</p>
            <h3 className="font-serif text-2xl italic text-slate-900 mb-2 text-center">
              Maksud kamu...?
            </h3>
            <p className="text-slate-500 text-sm mb-6 text-center font-light">
              Nama "<span className="font-medium text-slate-700">{name}</span>" tidak ditemukan, 
              tapi kami menemukan yang mirip:
            </p>

            <div className="space-y-3">
              {suggestions.map((s) => (
                <motion.button
                  key={s.id}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setSuggestions([]);
                    onAccess(s.data.id ? s.data : { id: s.id, ...s.data });
                  }}
                  className="w-full text-left px-5 py-4 rounded-2xl border border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 capitalize">
                        {s.data.originalName || capitalize(s.data.name)} ({s.data.name})
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tamu dari {s.data.side === 'groom' ? 'Widhar' : 'Refi'}
                        {s.data.note ? ` · ${s.data.note}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] bg-slate-100 group-hover:bg-white text-slate-500 px-2 py-1 rounded-full font-display uppercase tracking-wider transition-colors">
                      {Math.round(s.score * 100)}% mirip</span>
                  </div>
                </motion.button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setSuggestions([]);
                setRequestForm({ originalName: name, side: 'bride', note: '' });
                setShowRequestForm(true);
              }}
              className="mt-5 w-full py-3 text-slate-400 text-sm hover:text-slate-600 transition-colors"
            >
              Bukan, minta akses baru
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};

const PhotoHeartButton = ({
  side,
  position,
  likers,
  currentGuest,
  onLike,
}: {
  side: 'bride' | 'groom';
  position: 'left' | 'right';
  likers: string[];
  currentGuest: string;
  onLike: () => void;
}) => {
  const [showBubble, setShowBubble] = useState(false);
  const isLiked = likers.includes(currentGuest);
  const count = likers.length;

  return (
    <div
      className={`absolute -bottom-2 ${position === 'left' ? '-left-2' : '-right-2'} flex flex-col items-center`}
      style={{ zIndex: 10 }}
    >
      {/* Bubble */}
      <AnimatePresence>
        {showBubble && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full mb-3 bg-slate-900 text-white rounded-2xl px-3 py-2.5 shadow-xl z-20 whitespace-nowrap"
            style={{ [position === 'left' ? 'left' : 'right']: 0 }}
          >
            {/* Segitiga */}
            <div className={`absolute top-full ${position === 'left' ? 'left-4' : 'right-4'} border-4 border-transparent border-t-slate-900`} />
            
            {count === 0 ? (
              <p className="text-[10px] text-slate-300 font-light">Jadi yang pertama ❤️</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="font-display text-[9px] uppercase tracking-widest text-slate-400 text-center">
                  {count} orang suka
                </p>
                <div className="flex flex-wrap gap-1 max-w-[160px] justify-center">
                  {[
                    ...likers.filter(n => n === currentGuest),
                    ...likers.filter(n => n !== currentGuest),
                  ].slice(0, 3).map((name) => (
                    <span
                      key={name}
                      className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${
                        name === currentGuest
                          ? 'bg-rose-500/30 text-rose-200'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      {name}
                    </span>
                  ))}
                  {count > 3 && (
                    <span className="text-slate-400 text-[9px] self-center">
                      & {count - 3} lainnya
                    </span>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tombol */}
      <motion.button
        onClick={onLike}
        onMouseEnter={() => setShowBubble(true)}
        onMouseLeave={() => setShowBubble(false)}
        onTouchStart={() => setShowBubble(true)}
        onTouchEnd={() => setTimeout(() => setShowBubble(false), 2500)}
        whileTap={{ scale: 0.85 }}
        className="w-12 h-12 bg-white rounded-full shadow-lg flex flex-col items-center justify-center gap-0.5 hover:scale-110 transition-transform"
      >
        <motion.div
          animate={isLiked ? { scale: [1, 1.5, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          <Heart className={`w-5 h-5 transition-all duration-300 ${
            isLiked
              ? 'text-rose-500 fill-rose-500'
              : 'text-dusty-600 fill-dusty-50'
          }`} />
        </motion.div>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[8px] font-display text-slate-400 tabular-nums leading-none"
          >
            {count}
          </motion.span>
        )}
      </motion.button>
    </div>
  );
};

const EnvelopeTransition = ({
  guestName,
  orderedNames,
  onComplete,
  isClosing = false
}: {
  guestName: string;
  orderedNames: string;
  onComplete: () => void;
  isClosing?: boolean;
}) => {
  const [phase, setPhase] = useState<'idle' | 'flip' | 'opening' | 'rising' | 'unfolding' | 'zooming' | 'done'>(
    isClosing ? 'zooming' : 'idle'
  );

  useEffect(() => {
    if (!isClosing) {
      // --- ANIMASI MAJU (MEMBUKA) ---
      const t1 = setTimeout(() => setPhase('flip'),      1200); 
      const t2 = setTimeout(() => setPhase('opening'),   3000); 
      const t3 = setTimeout(() => setPhase('rising'),    4800); 
      const t4 = setTimeout(() => setPhase('unfolding'), 6600); 
      const t5 = setTimeout(() => setPhase('zooming'),   8400); 
      const t6 = setTimeout(() => setPhase('done'),      9800); 
      return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
    } else {
      // --- ANIMASI MUNDUR (MENUTUP) ---
      const t1 = setTimeout(() => setPhase('unfolding'), 100);  // 1. Zoom Out (Kertas menyusut)
      const t2 = setTimeout(() => setPhase('rising'),    1700); // 2. Kertas dilipat ke bawah
      const t3 = setTimeout(() => setPhase('opening'),   3300); // 3. Kertas ditarik masuk amplop
      const t4 = setTimeout(() => setPhase('flip'),      4900); // 4. Flap amplop tutup
      const t5 = setTimeout(() => setPhase('idle'),      6800); // 5. Amplop putar balik
      const t6 = setTimeout(() => onComplete(),          8600); // 6. Selesai
      return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
    }
  }, [isClosing, onComplete]);

  useEffect(() => {
    if (!isClosing && phase === 'done') onComplete();
  }, [phase, onComplete, isClosing]);

  const isFlipped   = phase !== 'idle';
  const isOpen      = phase === 'opening' || phase === 'rising' || phase === 'unfolding' || phase === 'zooming' || phase === 'done';
  const isRising    = phase === 'rising' || phase === 'unfolding' || phase === 'zooming' || phase === 'done';
  const isUnfolding = phase === 'unfolding' || phase === 'zooming' || phase === 'done';
  const isZooming   = phase === 'zooming' || phase === 'done';

  const W = Math.min(320, Math.max(260, window.innerWidth * 0.78));
  const H = Math.round(W * 0.6875);
  const cardW = Math.round(W * 0.882);
  const cardH = Math.round(H * 0.782);

  const TopContent = () => (
    <div className="flex flex-col items-center justify-center w-full h-full p-4 gap-3 bg-white">
      <Heart className="w-5 h-5 text-dusty-600 fill-dusty-100" />
      <p className="font-display text-[9px] tracking-[0.4em] uppercase text-slate-400 text-center leading-relaxed">
        Undangan<br />Pernikahan
      </p>
    </div>
  );

  const BottomContent = () => (
    <div className="flex flex-col items-center justify-center w-full h-full p-4 gap-2 bg-white">
      <p className="font-serif text-2xl italic font-bold text-slate-900 py-1">
        {orderedNames}
      </p>
      <div className="flex gap-1.5 my-1">
        <Heart className="w-2 h-2 text-rose-300 fill-rose-100" />
        <Heart className="w-2 h-2 text-rose-300 fill-rose-100" />
        <Heart className="w-2 h-2 text-rose-300 fill-rose-100" />
      </div>
      <p className="font-display text-[9px] tracking-[0.3em] uppercase text-slate-300">
        30 · 31 Mei 2026
      </p>
    </div>
  );


  return (
    <div className="fixed inset-0 z-[150] bg-cream-50 flex flex-col items-center justify-center">
      <div style={{ perspective: 1400, width: W, height: H }}>
        <motion.div
          className="relative"
          style={{ width: W, height: H, transformStyle: 'preserve-3d' }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }} 
        >

          {/* === SISI DEPAN AMPLOP === */}
          <motion.div
            className="absolute inset-0 rounded-xl bg-[#f0ece4] flex flex-col items-center justify-center gap-3 shadow-xl shadow-slate-200"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            animate={{ opacity: isZooming ? 0 : 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="absolute top-5 left-6 right-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#d6d0c4]" />
              <Heart className="w-3 h-3 text-[#b8a99a] fill-[#b8a99a]" />
              <div className="h-px flex-1 bg-[#d6d0c4]" />
            </div>
            <p className="font-display text-[9px] tracking-[0.45em] uppercase text-[#a09080]">Dari</p>
            <p className="font-serif text-lg italic font-bold text-[#5a4a3a]">{orderedNames}</p>
            <div className="w-8 h-px bg-[#d6d0c4] my-1" />
            <p className="font-display text-[9px] tracking-[0.45em] uppercase text-[#a09080]">Kepada Yth.</p>
            <p className="font-serif text-2xl italic font-bold text-[#3a2e24]">{capitalize(guestName)}</p>
            <div className="absolute bottom-5 left-6 right-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#d6d0c4]" />
              <Heart className="w-3 h-3 text-[#b8a99a] fill-[#b8a99a]" />
              <div className="h-px flex-1 bg-[#d6d0c4]" />
            </div>
          </motion.div>

          {/* === SISI BELAKANG AMPLOP === */}
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              perspective: 1400,
            }}
          >
            <div
              className="absolute inset-0"
              style={{ overflow: isRising ? 'visible' : 'hidden', borderRadius: 8, zIndex: 0 }}
            >
              <motion.div 
                className="absolute inset-0 rounded-lg bg-white" 
                style={{ zIndex: 1 }} 
                animate={{ opacity: isZooming ? 0 : 1 }}
                transition={{ duration: 0.6 }}
              />

              {/* === CONTAINER KERTAS SURAT === */}
              <motion.div
                className="absolute"
                style={{
                  bottom: 8,
                  left: '50%',
                  width: cardW,
                  height: cardH,
                  zIndex: isUnfolding ? 20 : 2, 
                  perspective: 1200,
                  transformStyle: 'preserve-3d',
                }}
                initial={{ x: '-50%', y: 0, scale: 1 }} 
                animate={{
                  x: '-50%',
                  y: isZooming 
                      ? -H / 2 
                      : (isRising ? -cardH * 0.55 : 0), 
                  scale: isZooming ? 12 : 1,
                  // PERBAIKAN: Jika sedang menutup (isClosing), surat wajib 100% solid (opacity 1) agar terlihat mengecil
                  opacity: (isZooming && !isClosing) ? 0 : 1,
                }}
                transition={{
                  duration: isZooming ? 1.4 : 1.6, 
                  ease: isZooming ? [0.65, 0, 0.35, 1] : [0.4, 0, 0.2, 1],
                  opacity: { duration: 0.8, delay: (isZooming && !isClosing) ? 0.5 : 0 } 
                }}
              >
                
                {/* 1. SETENGAH BAWAH KERTAS */}
                <div
                  className="absolute bottom-0 w-full overflow-hidden rounded-b-sm border border-slate-100 border-t-0 bg-white"
                  style={{ height: '50%', boxShadow: isZooming ? 'none' : '0 4px 16px rgba(0,0,0,0.07)' }}
                >
                  <BottomContent />
                  <motion.div 
                    className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/5 to-transparent z-10 pointer-events-none"
                    animate={{ opacity: isUnfolding ? 0 : 1 }}
                    transition={{ duration: 1.2 }}
                  />
                </div>

                {/* 2. SETENGAH ATAS KERTAS */}
                <motion.div
                  className="absolute top-0 w-full z-10"
                  style={{
                    height: '50%',
                    transformOrigin: 'bottom center',
                    transformStyle: 'preserve-3d',
                  }}
                  initial={{ rotateX: -179.9 }} 
                  animate={{ rotateX: isUnfolding ? 0 : -179.9 }}
                  transition={{ 
                    duration: 1.6, 
                    ease: [0.4, 0, 0.2, 1]
                  }}
                >
                  <div
                    className="absolute inset-0 bg-[#faf9f7] border border-slate-200 rounded-t-sm flex items-center justify-center shadow-md"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
                  >
                    <Heart className="w-5 h-5 text-slate-300 fill-slate-50" />
                  </div>

                  <div
                    className="absolute inset-0 overflow-hidden rounded-t-sm border border-slate-100 border-b-0"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                  >
                    <TopContent />
                  </div>
                </motion.div>
              </motion.div>

              {/* LAYER KANTONG DEPAN AMPLOP */}
              <motion.div 
                className="absolute inset-0" 
                style={{ zIndex: 3, pointerEvents: 'none' }}
                animate={{ opacity: isZooming ? 0 : 1 }}
                transition={{ duration: 0.6 }}
              >
                <div className="absolute inset-0" style={{ background: '#ddd8cf', clipPath: 'polygon(0 0, 0 100%, 50% 57%)' }} />
                <div className="absolute inset-0" style={{ background: '#e5e0d6', clipPath: 'polygon(100% 0, 50% 57%, 100% 100%)' }} />
                <div className="absolute inset-0" style={{ background: '#ccc6bc', clipPath: 'polygon(0 100%, 50% 57%, 100% 100%)' }} />
              </motion.div>
            </div>

            {/* FLAP TUTUP AMPLOP */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: '#e5e0d5',
                clipPath: 'polygon(0 0, 50% 57%, 100% 0)',
                transformOrigin: 'top center',
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                zIndex: isRising ? 0 : 5, 
              }}
              animate={{ rotateX: isOpen ? -178 : 0, opacity: isZooming ? 0 : 1 }}
              transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }} 
            />

            {/* SEGEL AMPLOP */}
            <motion.div
              className="absolute flex items-center justify-center"
              style={{ top: '57%', left: '50%', zIndex: 7 }}
              initial={{ x: '-50%', y: '-50%' }}
              animate={{
                x: '-50%',
                y: '-50%',
                scale: isOpen ? 0 : 1,
                rotate: isOpen ? 30 : 0,
                opacity: isOpen ? 0 : 1,
              }}
              transition={{ 
                duration: 0.35, 
                ease: 'easeIn',
                delay: (!isOpen && isClosing) ? 1.4 : 0 
              }}
            >
              <div className="w-10 h-10 bg-rose-600 rounded-full flex items-center justify-center shadow-md shadow-rose-200">
                <Heart className="w-4 h-4 text-white fill-white/40" />
              </div>
            </motion.div>

          </div>
        </motion.div>
      </div>
    </div>
  );
};

// 1. Data cerita interaktif 3D
const stories3D = [
  {
    id: 1,
    frontTag: "Pertemuan Awal ⏳",
    frontText: "Kalau dibilang romantis, awalnya tidak juga. Pertemuan kami dimulai dengan canggung — percakapan yang tidak tahu harus kemana, dan tawa yang dipaksakan.",
    backTag: "Takdir Punya Cara 🤍",
    backText: "Tapi di era ini, begitulah cara banyak orang memulai. Takdir punya caranya sendiri untuk bekerja, dan kami adalah salah satu buktinya.",
  },
  {
    id: 2,
    frontTag: "Proses Nyaman ✨",
    frontText: "Perlahan, yang canggung berubah jadi kenyamanan yang hangat. Yang nyaman mulai menumbuhkan rasa rindu setiap kali berjauhan.",
    backTag: "Satu Tujuan 💍",
    backText: "Dua tahun bukan waktu yang sebentar untuk saling mengenal, mengalah, dan memilih. Hari ini, kami memilih untuk menetap di satu tempat yang sama.",
  },
];


export default function App() {
  const [guest, setGuest] = useState<any>(null);
  const [rsvpStatus, setRsvpStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [formData, setFormData] = useState({ name: '', guests: '1', message: '', attendance: [] as string[], isAttending: true });
  const containerRef = useRef<HTMLDivElement>(null);
  const [guestMessages, setGuestMessages] = useState<any[]>([]);
  const [showEnvelope, setShowEnvelope] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [suggestClose, setSuggestClose] = useState(false); 
  const [likes, setLikes] = useState<{ bride: string[], groom: string[] }>({ bride: [], groom: [] });
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [bookPage, setBookPage] = useState<0 | 1 | 2>(0);
  const [flippedCount, setFlippedCount] = useState(0);
  const [showStatusPage, setShowStatusPage] = useState(
    window.location.search.includes('status')
  );


  const tooltipRef = useRef<HTMLDivElement>(null);

  // Taruh ini di dalam komponen "export default function App()"
  useEffect(() => {
    if (guest) {
      // Jika user sudah login / memasukkan nama
      const guestName = guest.originalName || guest.name;
      document.title = `Undangan untuk ${capitalize(guestName)}`;
    } else {
      // Judul default saat pintu gerbang (InvitationGate) belum dibuka
      document.title = "Nikahan Refi & Widhar";
    }
  }, [guest]); // useEffect ini akan berjalan setiap kali state 'guest' berubah

  // Deteksi ketika user klik tombol Back/Forward di browser
  useEffect(() => {
    const handlePopState = () => {
      // Cek apakah di URL saat ini ada kata 'status'
      const isStatusPage = window.location.search.includes('status');
      setShowStatusPage(isStatusPage);
    };

    // Pasang "telinga" ke browser
    window.addEventListener('popstate', handlePopState);

    // Bersihkan "telinga" saat komponen dibongkar
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Deteksi scroll ke bawah
  useEffect(() => {
    if (!guest || showEnvelope) return;

    const handleScroll = () => {
      // Jika scroll sudah menyentuh jarak 100px dari paling bawah dokumen
      const isBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100;
      if (isBottom) {
        setSuggestClose(true);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [guest, showEnvelope]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTooltip]);

  const handleAccess = (guestData: any) => {
    setGuest(guestData);      // simpan data guest
    setIsClosing(false); // Pastikan modenya adalah buka, bukan tutup
    setShowEnvelope(true);    // tampilkan transisi amplop
  };
  const marqueeRef = useRef<HTMLDivElement>(null);

  // Handler ini dipanggil ketika Envelope selesai jalan (maju ATAU mundur)
  const handleEnvelopeComplete = () => {
    if (isClosing) {
      // Jika selesai nutup amplop, kembalikan ke Gate Awal
      setGuest(null);
      setShowEnvelope(false);
      setIsClosing(false);
    } else {
      // Jika selesai buka amplop, masuk ke undangan
      setShowEnvelope(false);
    }
  };

// Force hapus path tambahan (/notfound) atau hash (#) jika belum masuk
  useEffect(() => {
    if (!guest) {
      // Jika ada hash ATAU path-nya bukan root ("/")
      if (window.location.hash || window.location.pathname !== '/') {
        // Paksa URL kembali bersih ke "/" tanpa merefresh halaman
        window.history.replaceState(null, '', '/');
      }
    }
  }, [guest]);

  const handleLike = async (side: 'bride' | 'groom') => {
    const guestName = guest?.name;
    if (!guestName) return;

    const isLiked = likes[side].includes(guestName);
    const likesRef = doc(db, 'config', 'likes');

    try {
      await updateDoc(likesRef, {
        [side]: isLiked ? arrayRemove(guestName) : arrayUnion(guestName)
      });
    } catch {
      // Dokumen belum ada, buat baru
      await setDoc(likesRef, {
        bride: side === 'bride' && !isLiked ? [guestName] : [],
        groom: side === 'groom' && !isLiked ? [guestName] : [],
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'likes'), (snap) => {
      if (snap.exists()) {
        setLikes({
          bride: snap.data()?.bride || [],
          groom: snap.data()?.groom || [],
        });
      }
    });
    return () => unsubscribe();
  }, []);


  const brideName = "Refi";
  const groomName = "Widhar";
  const orderedNames = guest?.side === 'groom' ? `${groomName} & ${brideName}` : `${brideName} & ${groomName}`;

  const eventDetails = {
    bride: {
      receptionDate: "2026-05-30T07:00:00.000+07:00",
      displayDate: "Minggu, 30 Mei 2026",
      displayTime: "10:00 WIB - Selesai",
      locationName: "Aula Kelurahan Doko",
      locationAddress: "Jl. Dandang Gendis No.279, Sumber, Doko, Kec. Ngasem, Kabupaten Kediri",
      mapUrl: "https://www.google.com/maps/dir/?api=1&destination=Aula+Kelurahan+Doko+Ngasem+Kediri&travelmode=driving"
    },
    groom: {
      receptionDate: "2026-05-30T07:00:00.000+07:00",
      displayDate: "Minggu, 31 Mei 2026",
      displayTime: "10:00 WIB - Selesai",
      locationName: "Kediaman Mempelai Pria",
      locationAddress: "Jl. Gunung Agung No.189, Dermo, Kec. Mojoroto, Kota Kediri",
      mapUrl: "https://www.google.com/maps/dir/?api=1&destination=Jl+Gunung+Agung+No+189+Dermo+Mojoroto+Kediri&travelmode=driving"
    }
  };

  const currentEvent = guest?.side === 'groom' ? eventDetails.groom : eventDetails.bride;
  const weddingDate = currentEvent.receptionDate;

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  useEffect(() => {
  const q = query(
    collection(db, 'guests'),
    orderBy('updatedAt', 'desc')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter(
        (guest: any) =>
          guest.message &&
          guest.message.trim() !== ''
          // guest.message.trim() !== '' &&
          // guest.isAttending
      );

    setGuestMessages(messages);
  });

  return () => unsubscribe();
}, []);

  useEffect(() => {
    if (guest) {
      setFormData({
        name: guest.originalName || guest.name,
        guests: guest.guestsCount?.toString() || '1',
        message: guest.message || '',
        isAttending: guest.isAttending ?? true,
        attendance: guest.attendance || []
      });
      // If guest has already confirmed, show success state
    
      if (guest.hasResponded) {
        setRsvpStatus('success');
      }
    }
  }, [guest]);

  const deadlineDate = new Date('2026-05-28T23:59:59+07:00'); // Batas akhir 23 Mei 2026 jam 23:59
  const isPastDeadline = new Date() > deadlineDate;

  const handleRSVP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isPastDeadline) {
      alert('Maaf, batas waktu konfirmasi kehadiran telah berakhir pada 28 Mei 2026 Pukul 23:59.');
      return; // Hentikan eksekusi kode di bawahnya
    }
    
    setRsvpStatus('submitting');
    
    try {
      if (guest?.id) {
        const guestRef = doc(db, 'guests', guest.id);
        try {
          await updateDoc(guestRef, {
            hasResponded: true,
            isAttending: formData.isAttending,
            guestsCount: formData.isAttending? Math.max(1, Number(formData.guests || 1)) : 0,            message: formData.message,
            attendance: formData.isAttending
              ? formData.attendance
              : [],
            updatedAt: new Date(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `guests/${guest.id}`);
        }
        setTimeout(() => setSuggestClose(true), 2000);
        setRsvpStatus('success');
      }
    } catch (err) {
      console.error('Error updating RSVP:', err);
      // If it's our JSON error, we might want to show a more specific message
      alert('Maaf, Anda tidak memiliki izin untuk mengubah data ini atau RSVP sudah terisi.');
      setRsvpStatus('idle');
    }
  };

  const handleDownloadAkadICS = () => {
    const start = new Date("2026-05-30T07:00:00+07:00");
    const end = new Date("2026-05-30T09:00:00+07:00");

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//${orderedNames}//Wedding Invitation//ID`,
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `DTSTART:${formatDate(start)}`,
      `DTEND:${formatDate(end)}`,
      `SUMMARY:Akad Nikah ${orderedNames}`,
      'DESCRIPTION:Akhirnya sampai juga di hari ini. Kami ingin kalian ada.',
      'LOCATION:Aula Kelurahan Doko, Jl. Dandang Gendis No.279, Sumber, Doko, Kec. Ngasem, Kabupaten Kediri',
      'URL:https://maps.app.goo.gl/CB5adRU6wNCeUmtY6',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Akad_Nikah_${orderedNames.replace(/ & /g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadResepsiICS = () => {
    // Basic ICS formatting for the reception/ngunduh mantu
    const start = new Date(weddingDate);
    const end = new Date(weddingDate);
    end.setHours(end.getHours() + 4);

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//${orderedNames}//Wedding Invitation//ID`,
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `DTSTART:${formatDate(start)}`,
      `DTEND:${formatDate(end)}`,
      `SUMMARY:Pernikahan ${orderedNames} (${guest?.side === 'groom' ? 'Ngunduh Mantu' : 'Resepsi'})`,
      'DESCRIPTION:Akhirnya sampai juga di hari ini. Kami ingin kalian ada..',
      `LOCATION:${currentEvent.locationName}, ${currentEvent.locationAddress}`,
      `URL:${currentEvent.mapUrl}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Pernikahan_${orderedNames.replace(/ & /g, '_')}_${guest?.side === 'groom' ? 'Ngunduh_Mantu' : 'Resepsi'}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const controls = useAnimation();

  useEffect(() => {
    if (guestMessages.length === 0) return;
    
    const t = setTimeout(() => {
      controls.start({
        x: ['0%', '-50%'],
        transition: {
          duration: 40,
          repeat: Infinity,
          ease: 'linear',
        },
      });
    }, 100);
    return () => clearTimeout(t);
  }, [controls, guestMessages]);

  return (
    <div ref={containerRef} className="font-sans selection:bg-rose-100 bg-white">
      <AnimatePresence mode="wait">
        {showStatusPage && !guest ? (
          <RequestStatusPage
            key="status"
            onBack={() => {
              setShowStatusPage(false);
              window.history.replaceState(null, '', '/');
            }}
            onOpenInvitation={() => {
              setShowStatusPage(false);
              window.history.replaceState(null, '', '/');
              // Otomatis bersihkan URL agar user bisa langsung mendarat di halaman depan dengan URL steril
            }}
          />
        ): !guest ? (
          <InvitationGate key="gate" onAccess={handleAccess} onShowStatusPage={() => setShowStatusPage(true)} />
        ) : showEnvelope ? (
          <EnvelopeTransition 
            key="envelope"
            guestName={guest.name}
            orderedNames={orderedNames} 
            onComplete={handleEnvelopeComplete} // <--- Ganti pakai handler baru 
            isClosing={isClosing}               // <--- Kirim state isClosing
          />
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }} // <--- Wajib ditambah exit agar pudar mulus saat klik Close
            className="relative"
          >           
            {/* === TOMBOL CLOSE & TOOLTIP === */}
            <div className="fixed top-6 right-6 z-[100] flex flex-col items-end gap-4 pointer-events-none">
              
              {/* Tombol X Utama */}
              <button 
                onClick={() => {
                  setIsClosing(true);
                  setShowEnvelope(true);
                  setSuggestClose(false); // Sembunyikan tooltip saat nutup
                }}
                className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-slate-900 transition-all hover:scale-105 border border-slate-100 pointer-events-auto"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Tooltip Ajakan Nutup Surat */}
              <AnimatePresence>
                {suggestClose && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    className="relative bg-slate-900 text-white text-[11px] p-5 rounded-2xl shadow-2xl max-w-[200px] text-right pointer-events-auto cursor-pointer border border-slate-800 transition-transform hover:scale-105"
                    onClick={() => {
                       // Jika tooltipnya di-klik, langsung tutup suratnya
                       setIsClosing(true);
                       setShowEnvelope(true);
                       setSuggestClose(false);
                    }}
                  >
                    {/* Segitiga panah menunjuk ke atas (tombol X) */}
                    <div className="absolute -top-2 right-4 border-l-8 border-r-8 border-b-8 border-transparent border-b-slate-900" />
                    
                    <p className="mb-3 leading-relaxed font-light">
                      Udah selesai bacanya? Yuk lipat dan masukin ke amplop lagi! 💌✨
                    </p>
                    <span className="text-dusty-100 font-medium tracking-wide uppercase text-[9px] border border-dusty-100/30 bg-dusty-100/10 px-3 py-1.5 rounded-full">
                      Tutup Undangan
                    </span>

                    {/* Tombol X mini buat nolak/dismiss tooltip aja */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation(); // Biar gak kepencet trigger tutup surat
                        setSuggestClose(false);
                      }}
                      className="absolute -top-2 -left-2 bg-white text-slate-900 w-5 h-5 rounded-full flex items-center justify-center shadow-md hover:bg-slate-200 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <WeddingAIChat guestName={capitalize(guest.name)} />

            {/* Progress Bar & Sisa Undangan di bawahnya... */}
            <motion.div
              className="fixed top-0 left-0 right-0 h-1 bg-slate-900 z-50 origin-left"
              style={{ scaleX }}
            />

            {/* Hero Section */}
            <Section className="bg-cream-50">
              <div className="text-center z-10">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1.5, ease: "easeOut", delay: 1.5 }}
                  className="inline-block mb-8"
                >
                  <Heart className="w-8 h-8 text-dusty-600 fill-dusty-100" />
                </motion.div>
                <h2 className="font-display text-xs tracking-[0.4em] uppercase text-slate-400 mb-6">Undangan Pernikahan</h2>
                <h1 className="font-serif text-4xl sm:text-5xl md:text-7xl font-bold mb-4 tracking-tight text-slate-900 italic">
                  {orderedNames}
                </h1>
                <div className="inline-flex items-center gap-2 bg-dusty-50 border border-dusty-100 rounded-full px-4 py-2 mb-8">
                  <Heart className="w-3 h-3 text-dusty-600 fill-dusty-100" />
                  <p className="font-display text-xs tracking-widest text-dusty-600">Kepada Yth. {capitalize(guest.originalName)}</p>
                </div>
                <p className="text-lg md:text-xl text-slate-500 font-light max-w-xl mx-auto leading-relaxed">
                  Akhirnya sampai juga di hari ini. Akan sangat berarti kalau kamu bisa hadir merayakannya bersama kami.
                </p>
                
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.5, duration: 1 }}
                  className="mt-16"
                >
                  <motion.div
                    animate={{ y: [0, 8, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <ChevronDown className="w-5 h-5 mx-auto text-slate-300" />
                  </motion.div>
                </motion.div>
              </div>
            </Section>

          {/* Mempelai Section */}
          <Section className="bg-white overflow-hidden">
            <div className="max-w-4xl mx-auto text-center z-10">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 1 }}
                className="mb-16"
              >
                <p className="font-display text-xs tracking-[0.5em] uppercase text-slate-400 mb-6">Salam Hangat</p>
                <h2 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-8 italic">Mempelai</h2>
                <p className="text-slate-500 max-w-2xl mx-auto leading-relaxed italic font-serif">
                  "Dua orang yang berbeda, dari kota yang sama, akhirnya menemukan jalan pulang ke satu tempat yang sama."
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-8 items-center">
                {guest?.side === 'groom' ? (
                  <>
                    {/* Groom */}
                    <motion.div
                      initial={{ opacity: 0, x: -50 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="relative inline-block">
                        <div className="w-48 h-48 rounded-full bg-slate-100 mx-auto mb-6 overflow-hidden border-4 border-white shadow-xl">
                           <img 
                            // src="https://picsum.photos/seed/groom/400/400" 
                            src="https://lh3.googleusercontent.com/d/1CU9GDAnAoLit88H_Nd4Gwj9XtGOT-Exy"
                            alt="Widhar Dwiatmoko" 
                            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        {/* <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div> */}
                        <PhotoHeartButton
                          side="groom"
                          position="right"
                          likers={likes.groom}
                          currentGuest={guest.name}
                          onLike={() => handleLike('groom')}
                        />
                      </div>
                      <h3 className="font-serif text-3xl font-bold text-slate-900 italic">Widhar Dwiatmoko</h3>
                      <div className="space-y-1">
                        <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-medium">Putra dari</p>
                        <p className="text-slate-900 font-medium text-base md:text-lg">Alm. Bapak Sagi & Ibu Aminin</p>
                      </div>
                      <p className="text-slate-400 text-xs flex items-center justify-center gap-2">
                        <MapPin className="w-3 h-3" /> Dermo, Kediri
                      </p>
                    </motion.div>

                    {/* Separator for mobile */}
                    <div className="md:hidden flex items-center justify-center py-4">
                      <div className="h-px w-12 bg-slate-100" />
                      <span className="px-4 font-serif text-2xl text-dusty-100 italic">&</span>
                      <div className="h-px w-12 bg-slate-100" />
                    </div>

                    {/* Bride */}
                    <motion.div
                      initial={{ opacity: 0, x: 50 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: 0.4 }}
                      className="space-y-4"
                    >
                      <div className="relative inline-block">
                        <div className="w-48 h-48 rounded-full bg-slate-100 mx-auto mb-6 overflow-hidden border-4 border-white shadow-xl">
                          <img 
                            // src="https://picsum.photos/seed/bride/400/400" 
                            src="https://lh3.googleusercontent.com/d/1DWwiHymoVOqQxza70081lNtRrZIeqW-h"
                            alt="Refi Septiningtyas" 
                            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        {/* <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div> */}
                        <PhotoHeartButton
                          side="bride"
                          position="left"
                          likers={likes.bride}
                          currentGuest={guest.name}
                          onLike={() => handleLike('bride')}
                        />
                      </div>
                      <h3 className="font-serif text-3xl font-bold text-slate-900 italic">Refi Septiningtyas</h3>
                      <div className="space-y-1">
                        <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-medium">Putri dari</p>
                        <p className="text-slate-900 font-medium text-base md:text-lg">Bapak Moch. Taufik & Ibu Retno Anggraini</p>
                      </div>
                      <p className="text-slate-400 text-xs flex items-center justify-center gap-2">
                        <MapPin className="w-3 h-3" /> Burengan, Kediri
                      </p>
                    </motion.div>
                  </>
                ) : (
                  <>
                    {/* Bride */}
                    <motion.div
                      initial={{ opacity: 0, x: -50 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="relative inline-block">
                        <div className="w-48 h-48 rounded-full bg-slate-100 mx-auto mb-6 overflow-hidden border-4 border-white shadow-xl">
                          <img 
                            // src="https://picsum.photos/seed/bride/400/400" 
                            src="https://lh3.googleusercontent.com/d/1DWwiHymoVOqQxza70081lNtRrZIeqW-h"
                            alt="Refi" 
                            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        {/* <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div> */}
                        <PhotoHeartButton
                          side="bride"
                          position="left"
                          likers={likes.bride}
                          currentGuest={guest.name}
                          onLike={() => handleLike('bride')}
                        />
                      </div>
                      <h3 className="font-serif text-3xl font-bold text-slate-900 italic">Refi Septiningtyas</h3>
                      <div className="space-y-1">
                        <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-medium">Putri dari</p>
                        <p className="text-slate-900 font-medium text-lg">Bapak Moch. Taufik & Ibu Retno Anggraini</p>
                      </div>
                      <p className="text-slate-400 text-xs flex items-center justify-center gap-2">
                        <MapPin className="w-3 h-3" /> Burengan, Kediri
                      </p>
                    </motion.div>

                    {/* Separator for mobile */}
                    <div className="md:hidden flex items-center justify-center py-4">
                      <div className="h-px w-12 bg-slate-100" />
                      <span className="px-4 font-serif text-2xl text-dusty-100 italic">&</span>
                      <div className="h-px w-12 bg-slate-100" />
                    </div>

                    {/* Groom */}
                    <motion.div
                      initial={{ opacity: 0, x: 50 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: 0.4 }}
                      className="space-y-4"
                    >
                      <div className="relative inline-block">
                        <div className="w-48 h-48 rounded-full bg-slate-100 mx-auto mb-6 overflow-hidden border-4 border-white shadow-xl">
                           <img 
                            // src="https://picsum.photos/seed/groom/400/400" 
                            src="https://lh3.googleusercontent.com/d/1CU9GDAnAoLit88H_Nd4Gwj9XtGOT-Exy"
                            alt="Widhar" 
                            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        {/* <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div> */}
                        <PhotoHeartButton
                          side="groom"
                          position="right"
                          likers={likes.groom}
                          currentGuest={guest.name}
                          onLike={() => handleLike('groom')}
                        />
                      </div>
                      <h3 className="font-serif text-3xl font-bold text-slate-900 italic">Widhar Dwiatmoko</h3>
                      <div className="space-y-1">
                        <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-medium">Putra dari</p>
                        <p className="text-slate-900 font-medium text-lg">Alm. Bapak Sagi & Ibu Aminin</p>
                      </div>
                      <p className="text-slate-400 text-xs flex items-center justify-center gap-2">
                        <MapPin className="w-3 h-3" /> Dermo, Kediri
                      </p>
                    </motion.div>
                  </>
                )}
              </div>
            </div>
          </Section>

{/* The Story - Interactive Flipbook 3D (Z-Index Ghosting Fixed) */}
          <Section id="story" className="bg-[#f5f4f0] overflow-hidden min-h-screen flex items-center py-20">
            <div className="max-w-5xl mx-auto text-center w-full relative z-10 px-2 sm:px-4">
              
              {/* Pagination Dots */}
              <div className="flex justify-center gap-2.5 mb-10 md:mb-14">
                {[0, 1, 2, 3].map((i) => (
                  <div 
                    key={i} 
                    className={`h-2 rounded-full transition-all duration-300 ${flippedCount === i ? 'w-8 bg-slate-800' : 'w-2 bg-slate-300'}`} 
                  />
                ))}
              </div>

              {/* Wadah Utama 3D */}
              <div className="w-full flex justify-center" style={{ perspective: 2500 }}>
                <motion.div
                  className="relative w-[180px] min-[400px]:w-[190px] sm:w-[260px] md:w-[320px] h-[300px] min-[400px]:h-[320px] sm:h-[400px] md:h-[480px]"
                  animate={{ 
                    x: flippedCount === 0 ? '0%' : flippedCount === 3 ? '100%' : '50%' 
                  }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  
                  {/* ========================================================
                      LEMBAR 1 (Cover Depan & Halaman 1)
                      ======================================================== */}
                  <motion.div
                    className="absolute inset-0 origin-left"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{ rotateY: flippedCount > 0 ? -180 : 0, zIndex: flippedCount === 0 ? 30 : 10 }}
                    transition={{ 
                      duration: 0.8, 
                      ease: "easeInOut",
                      // KUNCI FIX: Tahan pergantian layer selama tepat 0.4s (saat kertas di posisi 90 derajat)
                      zIndex: { delay: 0.4, duration: 0 } 
                    }}
                  >
                    {/* Sisi Depan: Cover Depan */}
                    <div 
                      className="absolute inset-0 bg-[#e8e3d9] rounded-r-2xl p-6 sm:p-8 md:p-10 flex flex-col justify-between border border-slate-300/50 shadow-[6px_0_20px_rgba(0,0,0,0.1)] border-l-[6px] border-l-[#d5cfc4] cursor-pointer group overflow-hidden"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      onClick={() => setFlippedCount(1)}
                    >
                      <div className="w-full h-px bg-slate-300 mt-2 shrink-0" />
                      <div className="my-auto text-center border-y border-slate-300 py-8 md:py-12">
                        <Heart className="w-7 h-7 md:w-8 md:h-8 text-slate-800 fill-transparent mx-auto mb-5 md:mb-6 transition-transform group-hover:scale-110 shrink-0" />
                        <h3 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 italic leading-tight">Kisah Cinta<br/>Kita</h3>
                        <p className="font-display text-[10px] md:text-[12px] tracking-[0.35em] text-slate-500 uppercase mt-5 md:mt-6">Refi & Widhar</p>
                      </div>
                      <div className="w-full h-px bg-slate-300 mb-2 shrink-0" />
                      <div className="text-[10px] md:text-[11px] uppercase tracking-widest font-display text-slate-500 animate-pulse text-center shrink-0">
                        Ketuk Membuka 📖
                      </div>
                    </div>

                    {/* Sisi Belakang: Halaman 1 (Kiri saat terbuka) */}
                    <div 
                      className="absolute inset-0 bg-[#fdfcf7] rounded-r-2xl p-6 sm:p-8 md:p-10 flex flex-col border border-slate-200 shadow-inner border-l-2 border-l-[#e8e3d9] cursor-pointer overflow-hidden"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                      onClick={() => setFlippedCount(0)}
                    >
                      <p className="text-slate-600 font-serif italic text-[14px] min-[400px]:text-[15px] sm:text-lg md:text-xl leading-relaxed my-auto">
                        "Kalau dibilang romantis, awalnya tidak juga. Pertemuan kami dimulai dengan canggung — percakapan yang tak tahu harus kemana, dan tawa yang dipaksakan."
                      </p>
                      <div className="mt-auto flex justify-between items-center text-[10px] md:text-[12px] text-slate-400 font-display uppercase tracking-widest border-t border-slate-200 pt-4 shrink-0">
                        <span>1</span>
                        <span>Kembali ↺</span>
                      </div>
                    </div>
                  </motion.div>


                  {/* ========================================================
                      LEMBAR 2 (Halaman 2 & Halaman 3)
                      ======================================================== */}
                  <motion.div
                    className="absolute inset-0 origin-left"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{ rotateY: flippedCount > 1 ? -180 : 0, zIndex: 20 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    {/* Sisi Depan: Halaman 2 (Kanan saat terbuka) */}
                    <div 
                      className="absolute inset-0 bg-[#fdfcf7] rounded-r-2xl p-6 sm:p-8 md:p-10 flex flex-col border border-slate-200 shadow-md border-l-2 border-l-[#e8e3d9] cursor-pointer overflow-hidden"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      onClick={() => setFlippedCount(2)}
                    >
                      <p className="text-slate-600 font-serif italic text-[14px] min-[400px]:text-[15px] sm:text-lg md:text-xl leading-relaxed my-auto text-left">
                        "Tapi di era ini, begitulah cara banyak orang memulai. Takdir punya caranya sendiri untuk bekerja, dan kami adalah salah satu buktinya."
                      </p>
                      <div className="mt-auto flex justify-between items-center text-[10px] md:text-[12px] text-slate-400 font-display uppercase tracking-widest border-t border-slate-200 pt-4 shrink-0">
                        <span>Lanjut ➔</span>
                        <span>2</span>
                      </div>
                    </div>

                    {/* Sisi Belakang: Halaman 3 (Kiri saat terbuka) */}
                    <div 
                      className="absolute inset-0 bg-[#fdfcf7] rounded-r-2xl p-6 sm:p-8 md:p-10 flex flex-col border border-slate-200 shadow-inner border-l-2 border-l-[#e8e3d9] cursor-pointer overflow-hidden"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                      onClick={() => setFlippedCount(1)}
                    >
                      <p className="text-slate-600 font-serif italic text-[14px] min-[400px]:text-[15px] sm:text-lg md:text-xl leading-relaxed my-auto">
                        "Perlahan, yang canggung berubah jadi kenyamanan. Dua tahun bukan waktu yang sebentar, dan hari ini, kami memilih untuk menetap."
                      </p>
                      <div className="mt-auto flex justify-between items-center text-[10px] md:text-[12px] text-slate-400 font-display uppercase tracking-widest border-t border-slate-200 pt-4 shrink-0">
                        <span>3</span>
                        <span>Kembali ↺</span>
                      </div>
                    </div>
                  </motion.div>


                  {/* ========================================================
                      LEMBAR 3 (Halaman 4 & Cover Belakang)
                      ======================================================== */}
                  <motion.div
                    className="absolute inset-0 origin-left"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{ rotateY: flippedCount > 2 ? -180 : 0, zIndex: flippedCount === 3 ? 30 : 10 }}
                    transition={{ 
                      duration: 0.8, 
                      ease: "easeInOut",
                      // KUNCI FIX: Selaraskan dengan keterlambatan Lembar 1
                      zIndex: { delay: 0.4, duration: 0 } 
                    }}
                  >
                    {/* Sisi Depan: Halaman Terakhir (Kanan) */}
                    <div 
                      className="absolute inset-0 bg-[#fdfcf7] rounded-r-2xl p-6 sm:p-8 md:p-10 flex flex-col border border-slate-200 shadow-md border-l-2 border-l-[#e8e3d9] cursor-pointer overflow-hidden"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      onClick={() => setFlippedCount(3)}
                    >
                      <Heart className="w-6 h-6 md:w-8 md:h-8 text-rose-300 fill-rose-100 mx-auto mt-2 mb-5 shrink-0" />
                      <p className="text-slate-600 font-serif italic text-[14px] min-[400px]:text-[15px] sm:text-lg md:text-xl leading-relaxed text-center my-auto">
                        "Cinta bukan tentang menemukan orang yang sempurna, tapi tentang memilih untuk tetap tinggal — setiap harinya."
                      </p>
                      <div className="mt-auto flex justify-between items-center text-[10px] md:text-[12px] text-slate-400 font-display uppercase tracking-widest border-t border-slate-200 pt-4 shrink-0">
                        <span className="text-slate-800 font-bold">Tutup ➔</span>
                        <span>4</span>
                      </div>
                    </div>

                    {/* Sisi Belakang: Cover Belakang (Menutup Sempurna) */}
                    <div 
                      className="absolute inset-0 bg-[#e8e3d9] rounded-r-2xl p-6 sm:p-8 md:p-10 flex flex-col justify-between border border-slate-300/50 shadow-[6px_0_20px_rgba(0,0,0,0.1)] border-l-[6px] border-l-[#d5cfc4] cursor-pointer group overflow-hidden"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                      onClick={() => setFlippedCount(0)}
                    >
                      <div className="my-auto text-center">
                        <div className="inline-flex gap-2 mb-6 md:mb-8">
                          <Heart className="w-4 h-4 md:w-5 md:h-5 text-rose-400 fill-rose-400" />
                          <Heart className="w-4 h-4 md:w-5 md:h-5 text-rose-400 fill-rose-400" />
                          <Heart className="w-4 h-4 md:w-5 md:h-5 text-rose-400 fill-rose-400" />
                        </div>
                        <h3 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-slate-800 italic mb-3 md:mb-4">Babak Baru</h3>
                        <p className="font-display text-[10px] md:text-[11px] tracking-widest text-slate-500 uppercase">30 · 31 Mei 2026</p>
                      </div>

                      <div className="w-full h-px bg-slate-300/60 mb-4 md:mb-6 shrink-0" />
                      <div className="text-[10px] md:text-[11px] uppercase tracking-widest font-display text-slate-600 transition-colors text-center font-bold group-hover:text-slate-900 shrink-0">
                        ↺ Ulang Kisah
                      </div>
                    </div>
                  </motion.div>

                </motion.div>
              </div>

            </div>
          </Section>
          {/* Event Details */}
          <Section id="details" className="bg-cream-100">
            <div className="max-w-5xl mx-auto w-full z-10 space-y-12">
              <div className="text-center mb-16">
                <h2 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 italic mb-4">Detail Acara</h2>
                <div className="w-24 h-1 bg-dusty-600 mx-auto rounded-full opacity-20 mb-10" />

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1 }}
                  className="max-w-xl mx-auto"
                >
                  <p className="font-display text-[10px] uppercase tracking-[0.5em] text-slate-400 mb-6 text-center">Menuju Hari Bahagia</p>
                  <Countdown targetDate={weddingDate} />
                </motion.div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Akad Nikah */}
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="glass p-6 md:p-12 rounded-[2rem] md:rounded-[2.5rem] flex flex-col items-center text-center relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-sage-100/30 rounded-bl-full -mr-16 -mt-16" />
                  
                  <div className="w-16 h-16 bg-sage-100 rounded-3xl flex items-center justify-center mb-8 shadow-inner">
                    <Calendar className="w-8 h-8 text-sage-600" />
                  </div>
                  
                  <h3 className="font-serif text-3xl font-bold mb-8 text-slate-900 italic">Akad Nikah</h3>
                  
                  <div className="space-y-8 w-full">
                    <div className="space-y-2">
                      <p className="font-display text-[10px] uppercase tracking-[0.4em] text-slate-400">Waktu & Tanggal</p>
                      <p className="text-xl font-serif font-bold text-slate-900 italic">Minggu, 30 Mei 2026</p>
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <Clock className="w-4 h-4 text-sage-600" />
                        <span className="font-light">07:00 - 09:00 WIB</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-display text-[10px] uppercase tracking-[0.4em] text-slate-400">Lokasi</p>
                      <p className="text-xl font-serif font-bold text-slate-900 italic">Aula Kelurahan Doko</p>
                      <p className="text-slate-500 font-light text-sm max-w-xs mx-auto">
                        Jl. Dandang Gendis No.279, Sumber, Doko, Kec. Ngasem, Kabupaten Kediri
                      </p>
                    </div>

                    <div className="pt-6 flex flex-col items-center gap-6">
                      <a 
                        href="https://www.google.com/maps/dir/?api=1&destination=Aula+Kelurahan+Doko+Ngasem+Kediri&travelmode=driving" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-10 py-4 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-all flex items-center gap-3 text-xs uppercase tracking-[0.2em] font-display shadow-lg shadow-slate-200 w-full justify-center"
                      >
                        <ExternalLink className="w-4 h-4" /> Petunjuk Lokasi
                      </a>
                      
                      <button 
                        onClick={handleDownloadAkadICS}
                        className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-400 hover:text-slate-900 transition-colors font-display border-b border-slate-200 pb-1"
                      >
                        <Download className="w-3 h-3" /> Simpan ke Kalender (Akad)
                      </button>
                    </div>
                  </div>
                </motion.div>

                {/* Resepsi */}
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  className="glass p-6 md:p-12 rounded-[2rem] md:rounded-[2.5rem] flex flex-col items-center text-center relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-dusty-100/30 rounded-bl-full -mr-16 -mt-16" />

                  <div className="w-16 h-16 bg-dusty-100 rounded-3xl flex items-center justify-center mb-8 shadow-inner">
                    <Users className="w-8 h-8 text-dusty-600" />
                  </div>
                  
                  <h3 className="font-serif text-3xl font-bold mb-8 text-slate-900 italic">
                    {guest?.side === 'groom' ? 'Ngunduh Mantu' : 'Resepsi'}
                  </h3>
                  
                  <div className="space-y-8 w-full">
                    <div className="space-y-2">
                      <p className="font-display text-[10px] uppercase tracking-[0.4em] text-slate-400">Waktu & Tanggal</p>
                      <p className="text-xl font-serif font-bold text-slate-900 italic">{currentEvent.displayDate}</p>
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <Clock className="w-4 h-4 text-dusty-600" />
                        <span className="font-light">{currentEvent.displayTime}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-display text-[10px] uppercase tracking-[0.4em] text-slate-400">Lokasi</p>
                      <p className="text-xl font-serif font-bold text-slate-900 italic">{currentEvent.locationName}</p>
                      <p className="text-slate-500 font-light text-sm max-w-xs mx-auto">
                        {currentEvent.locationAddress}
                      </p>
                    </div>

                    <div className="pt-6 flex flex-col items-center gap-6">
                      <a 
                        href={currentEvent.mapUrl}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-10 py-4 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-all flex items-center gap-3 text-xs uppercase tracking-[0.2em] font-display shadow-lg shadow-slate-200 w-full justify-center"
                      >
                        <ExternalLink className="w-4 h-4" /> Petunjuk Lokasi
                      </a>

                      <button 
                        onClick={handleDownloadResepsiICS}
                        className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-400 hover:text-slate-900 transition-colors font-display border-b border-slate-200 pb-1"
                      >
                        <Download className="w-3 h-3" /> Simpan ke Kalender ({guest?.side === 'groom' ? 'Ngunduh Mantu' : 'Resepsi'})
                      </button>
                      
                      {/* <div className="mt-4 w-full">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300 mb-4">Menuju Hari Bahagia</p>
                        <Countdown targetDate={weddingDate} />
                      </div> */}
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </Section>

          {/* RSVP Section */}
          <Section id="rsvp" className="bg-dusty-50">
            <div className="max-w-lg mx-auto w-full z-10">
              <div className="glass p-6 md:p-14 rounded-3xl shadow-lg shadow-dusty-100/20">
                <div className="text-center mb-12">
                  <h2 className="font-serif text-3xl font-bold mb-4 text-slate-900 italic">Konfirmasi Kehadiran</h2>
                  <p className="text-slate-500 font-light">Mohon konfirmasi kehadiran Anda sebelum tanggal 28 Mei 2026 Pukul 23:59</p>
                </div>
                <AnimatePresence mode="wait">
                  {rsvpStatus === 'success' ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-10"
                    >
                      <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Heart className="w-6 h-6 text-sage-600 fill-sage-600/20" />
                      </div>
                      {/* <h3 className="text-xl font-bold mb-2 text-slate-900">Terima Kasih!</h3>
                      <p className="text-slate-500 font-light">Konfirmasi Anda telah kami terima.</p> */}
                      {formData.isAttending ? (
                        <>
                          <h3 className="text-xl font-bold mb-2 text-slate-900">Sampai jumpa! 🤍</h3>
                          <p className="text-slate-500 font-light">
                            Kami sudah tidak sabar bertemu kamu di sana.
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold mb-2 text-slate-900">Terima kasih sudah memberi tahu kami.</h3>
                          <p className="text-slate-500 font-light">
                            Doa kamu tetap berarti buat kami, walaupun tidak bisa hadir.
                          </p>
                        </>
                      )}
                      {!formData.isAttending && guest?.side === 'groom' && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="mt-8 p-6 rounded-3xl bg-slate-50 border border-slate-100 text-left"
                        >
                          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-4 font-display">
                            Titipan Kasih
                          </p>
                          <p className="text-slate-600 text-sm leading-relaxed mb-6 font-light">
                            Kehadiran dan doa Anda sudah sangat berarti bagi kami. 
                            Namun jika ingin mengirimkan tanda kasih, dapat melalui rekening berikut:
                          </p>
                          <div className="space-y-4">
                            <div className="bg-white rounded-2xl border border-slate-100 p-4">
                              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">BCA</p>
                              <p className="text-lg font-semibold text-slate-900 tracking-wide">0153953918</p>
                              <p className="text-sm text-slate-500">a.n. Widhar Dwiatmoko</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      
                      {formData.attendance.length > 0 && (
                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                          {formData.attendance.map(event => (
                            <span key={event} className="px-3 py-1 bg-sage-50 text-sage-600 rounded-full text-[10px] uppercase tracking-wider font-medium border border-sage-100">
                              {event}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* TOMBOL EDIT HANYA MUNCUL JIKA BELUM DEADLINE */}
                      <button 
                        type="button"
                        onClick={() => {
                          if (isPastDeadline) {
                            alert('Maaf, batas waktu konfirmasi sudah berakhir pada 23 Mei 2026. Data tidak dapat diubah kembali.');
                          } else {
                            setRsvpStatus('idle');
                          }
                        }}
                        className={`mt-8 text-sm transition-all flex items-center justify-center gap-2 mx-auto ${
                          isPastDeadline 
                            ? 'text-slate-300 cursor-not-allowed' 
                            : 'text-slate-400 hover:text-slate-600 underline underline-offset-4'
                        }`}
                      >
                        {isPastDeadline ? (
                          <>
                            <Lock className="w-3 h-3" /> Konfirmasi sudah dikunci (Batas waktu terlewati)
                          </>
                        ) : (
                          "Kirim konfirmasi lain"
                        )}
                      </button>
                    </motion.div>
                  ) : isPastDeadline ? (
                    /* --- TAMPILAN JIKA DEADLINE SUDAH LEWAT & BELUM ISI RSVP --- */
                    <motion.div
                      key="closed"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-10"
                    >
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-6 h-6 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-bold mb-2 text-slate-900">RSVP Ditutup</h3>
                      <p className="text-slate-500 font-light">
                        Maaf, batas waktu konfirmasi kehadiran telah berakhir pada tanggal 23 Mei 2026 Pukul 23:59.
                      </p>
                    </motion.div>
                  ) : (
                    /* --- TAMPILAN FORM RSVP (SEBELUM DEADLINE) --- */
                    <motion.form
                      key="form"
                      exit={{ opacity: 0, scale: 0.95 }}
                      onSubmit={handleRSVP}
                      className="space-y-8"
                    >
                    <div>
                      <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">
                        Konfirmasi Kehadiran
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, isAttending: true })}
                          className={`py-4 rounded-2xl border transition-all ${
                              formData.isAttending ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
                          }`}
                        >
                          Hadir
                        </button>

                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, isAttending: false, attendance: [] })}
                          className={`py-4 rounded-2xl border transition-all ${
                              !formData.isAttending ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
                          }`}
                        >
                          Tidak Hadir
                        </button>
                      </div>
                    </div>
                    {formData.isAttending && (
                        <>
                      <div>
                        <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Acara yang Dihadiri</label>
                        <div className="space-y-3">
                          {['Akad Nikah', guest?.side === 'groom' ? 'Ngunduh Mantu' : 'Resepsi'].map((option) => (
                            <label key={option} className="flex items-center gap-3 cursor-pointer group">
                              <div className="relative flex items-center">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={formData.attendance.includes(option)}
                                  onChange={(e) => {
                                    const newAttendance = e.target.checked
                                      ? [...formData.attendance, option]
                                      : formData.attendance.filter((a) => a !== option);
                                    setFormData({ ...formData, attendance: newAttendance });
                                  }}
                                />
                                <div className="w-6 h-6 border-2 border-slate-200 rounded-lg peer-checked:bg-slate-900 peer-checked:border-slate-900 transition-all flex items-center justify-center">
                                  <div className="w-2 h-2 bg-white rounded-full opacity-0 peer-checked:opacity-100 transition-opacity" />
                                </div>
                              </div>
                              <span className="text-slate-600 font-light group-hover:text-slate-900 transition-colors">{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">
                          Nama Tamu
                        </label>
                        <div className="relative">
                          <input
                            readOnly
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-slate-500 font-medium cursor-not-allowed focus:outline-none"
                            value={formData.name}
                          />
                          <Lock className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 ml-2 font-light italic">
                          *Nama telah disesuaikan dengan data undangan
                        </p>
                      </div>
                      {/* <div>
                        <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Jumlah Tamu</label>
                        <div className="relative">
                          <select
                            className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-dusty-100 transition-all text-slate-900 appearance-none"
                            value={formData.guests}
                            onChange={e => setFormData({...formData, guests: e.target.value})}
                          >
                            <option value="1">1 Orang</option>
                            <option value="2">2 Orang</option>
                          </select>
                          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div> */}
                      <div>
                        <div className="flex items-center gap-2 mb-3 ml-1">
                          <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400">
                            Jumlah Tamu
                          </label>
                          
                          {/* Tooltip Wrapper */}
                          <div className="relative flex items-center" ref={tooltipRef}> {/* Pasang ref di sini */}
                            <HelpCircle 
                              className="w-3.5 h-3.5 text-slate-300 cursor-pointer hover:text-slate-500 transition-colors"
                              onClick={() => setShowTooltip(!showTooltip)}
                            />
                            
                            <AnimatePresence>
                              {showTooltip && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-4 bg-slate-900 text-white text-[11px] rounded-2xl shadow-2xl z-[60] text-center leading-relaxed"
                                >
                                  {/* Segitiga kecil di bawah tooltip */}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
                                  
                                  Demi kenyamanan bersama, satu undangan berlaku maksimal untuk 2 orang. Terima kasih! 😊
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div className="relative">
                          <select
                            className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-dusty-100 transition-all text-slate-900 appearance-none cursor-pointer"
                            value={formData.guests}
                            onChange={e => setFormData({...formData, guests: e.target.value})}
                            onClick={() => setShowTooltip(false)} // Otomatis menutup tooltip jika user klik pilihan dropdown
                          >
                            <option value="1">1 Orang</option>
                            <option value="2">2 Orang</option>
                          </select>
                          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                        </>
                      )}
                      <div>
                        <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Pesan untuk Mempelai</label>
                        {/* Quick Wishes Chips */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(formData.isAttending 
                            ? [
                                "Selamat ya! Bahagia selamanya ✨",
                                "Lancar sampai hari-H! Nggak sabar buat hadir 🤍",
                                "Semoga lancar acaranya, see you there! 🎉"
                              ]
                            : [
                                "Selamat ya! Maaf belum bisa hadir 🙏",
                                "Doa terbaik dari jauh untuk Refi & Widhar 🤍",
                                "Semoga lancar acaranya! Sedih banget nggak bisa ikut 🥺"
                              ]
                          ).map((wish) => (
                            <button
                              key={wish}
                              type="button"
                              onClick={() => setFormData({ ...formData, message: wish })}
                              className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all font-light text-left"
                            >
                              {wish}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={3}
                          className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-dusty-100 transition-all text-slate-900"
                          placeholder="Tuliskan ucapan atau doa..."
                          value={formData.message}
                          onChange={e => setFormData({...formData, message: e.target.value})}
                        />
                      </div>

                      <button
                        disabled={
                          rsvpStatus === 'submitting' ||
                          (
                            formData.isAttending &&
                            formData.attendance.length === 0
                          )
                        }
                        type="submit"
                        className="w-full py-4 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 font-display font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-slate-200"
                      >
                        {rsvpStatus === 'submitting' ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4" /> {formData.isAttending && formData.attendance.length === 0 ? 'Pilih Acara' : 'Kirim RSVP'}
                          </>
                        )}
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Section>

          {/* Wishes Section */}
          <section id="ucapan" className="relative px-4 py-24 md:px-6 md:py-32 overflow-hidden bg-white">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full flex flex-col items-center"
            >
              <div className="max-w-3xl mx-auto w-full z-10">
                <div className="text-center mb-14">
                  <h2 className="font-serif text-3xl font-bold text-slate-900 italic mb-4">
                    Ucapan & Doa
                  </h2>

                  <p className="text-slate-500 font-light">
                    Kata-kata yang membuat hari ini terasa lebih lengkap
                  </p>
                </div>

                <div className="relative w-full overflow-hidden">
                  {guestMessages.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center py-16"
                    >
                      <Heart className="w-8 h-8 text-dusty-100 fill-dusty-50 mx-auto mb-4" />
                      <p className="text-slate-300 font-light text-sm">Jadilah yang pertama mengirimkan doa 🤍</p>
                    </motion.div>

                  ) : guestMessages.length < 4 ? (
                    // STATIS — tidak marquee, tidak duplikat
                    <div className="flex flex-col gap-4 px-1">
                      {guestMessages.map((item) => (
                        <div key={item.id} className="bg-slate-50 border border-slate-100 rounded-3xl p-6 shadow-sm">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <h3 className="font-semibold text-slate-900 capitalize">{item.name}</h3>
                              <p className="text-xs text-slate-400">
                                {item.isAttending ? `${item.guestsCount ?? 1} tamu` : ''}
                              </p>
                            </div>
                            <Heart className="w-4 h-4 text-rose-300 fill-rose-100 shrink-0 mt-1" />
                          </div>
                          <p className="text-slate-600 leading-relaxed font-light">&ldquo;{item.message}&rdquo;</p>
                          <div className="flex flex-wrap gap-2 mt-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider border ${
                              item.isAttending
                                ? 'bg-sage-50 text-sage-600 border-sage-100'
                                : 'bg-rose-50 text-rose-500 border-rose-100'
                            }`}>
                              {item.isAttending ? 'Hadir' : 'Tidak Hadir'}
                            </span>
                            {item.isAttending && item.attendance?.map((event: string) => (
                              <span key={event} className="px-3 py-1 rounded-full bg-white border border-slate-100 text-[10px] uppercase tracking-wider text-slate-500">
                                {event}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                  ) : (
                    // MARQUEE — kalau sudah 4+ ucapan
                    <>
                      <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-white to-transparent pointer-events-none" />
                      <div className="absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />
                      <motion.div
                        ref={marqueeRef}
                        className="flex gap-5 w-max py-4"
                        animate={controls}
                        initial={{ x: '0%' }}
                        onPointerDown={() => controls.stop()}
                        onPointerUp={() => controls.start({
                          x: [null, '-50%'],
                          transition: { duration: 40, repeat: Infinity, ease: 'linear' },
                        })}
                        onPointerLeave={() => controls.start({
                          x: [null, '-50%'],
                          transition: { duration: 40, repeat: Infinity, ease: 'linear' },
                        })}
                      >
                        {[...guestMessages, ...guestMessages].map((item, index) => (
                          <motion.div
                            key={`${item.id}-${index}`}
                            animate={{ y: [0, -6, 0] }}
                            transition={{ duration: 4 + (index % 3), repeat: Infinity, ease: 'easeInOut' }}
                            className="min-w-[320px] max-w-[320px] bg-slate-50 border border-slate-100 rounded-3xl p-6 shrink-0 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div>
                                <h3 className="font-semibold text-slate-900 capitalize">{item.name}</h3>
                                <p className="text-xs text-slate-400">
                                  {item.isAttending ? `${item.guestsCount ?? 1} tamu` : ''}
                                </p>
                              </div>
                              <Heart className="w-4 h-4 text-rose-300 fill-rose-100 shrink-0 mt-1" />
                            </div>
                            <p className="text-slate-600 leading-relaxed font-light">&ldquo;{item.message}&rdquo;</p>
                            <div className="flex flex-wrap gap-2 mt-4">
                              <span className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider border ${
                                item.isAttending
                                  ? 'bg-sage-50 text-sage-600 border-sage-100'
                                  : 'bg-rose-50 text-rose-500 border-rose-100'
                              }`}>
                                {item.isAttending ? 'Hadir' : 'Tidak Hadir'}
                              </span>
                              {item.isAttending && item.attendance?.map((event: string) => (
                                <span key={event} className="px-3 py-1 rounded-full bg-white border border-slate-100 text-[10px] uppercase tracking-wider text-slate-500">
                                  {event}
                                </span>
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </section>

          {/* Footer */}
          <footer className="py-24 text-center bg-cream-50 border-t border-cream-100">
            <div className="max-w-xs mx-auto">
              <p className="font-display text-[10px] tracking-[0.5em] uppercase text-slate-300 mb-8">Terima Kasih</p>
              <Heart className="w-5 h-5 text-dusty-600 fill-dusty-100 mx-auto mb-8" />
              <p className="text-slate-400 font-light text-sm leading-relaxed italic font-serif">
                Kehadiran dan doa kalian adalah hadiah terbesar buat kami di hari yang paling kami tunggu-tunggu ini.
              </p>
            </div>
          </footer>

          {/* Floating Navigation */}
          <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-sm md:w-auto">
            <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-full shadow-2xl shadow-slate-300/40 w-full md:w-auto">
              <div className="flex items-center justify-between md:justify-start px-6 py-3 md:pl-8 md:pr-12 md:py-4 gap-0 md:gap-8">
                <a href="#" className="text-slate-400 hover:text-dusty-600 transition-colors shrink-0 flex items-center">
                  <Heart className="w-4 h-4" />
                </a>
                <div className="hidden md:block w-px h-3 bg-slate-200 shrink-0" />
                <a href="#story" className="text-slate-500 hover:text-slate-900 transition-colors font-display text-[10px] uppercase tracking-[0.2em] shrink-0">Kisah</a>
                <a href="#details" className="text-slate-500 hover:text-slate-900 transition-colors font-display text-[10px] uppercase tracking-[0.2em] shrink-0">Detail</a>
                <a href="#rsvp" className="text-slate-500 hover:text-slate-900 transition-colors font-display text-[10px] uppercase tracking-[0.2em] shrink-0">RSVP</a>
                <a href="#ucapan" className="text-slate-500 hover:text-slate-900 transition-colors font-display text-[10px] uppercase tracking-[0.2em] shrink-0">Ucapan</a>
              </div>
            </div>
          </nav>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}