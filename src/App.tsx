/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useSpring, AnimatePresence } from 'motion/react';
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
  Loader2
} from 'lucide-react';
import { db, auth } from './firebase';
import { collection, query, where, getDocs, doc, updateDoc, getFirestore, getDocFromServer, onSnapshot, orderBy } from 'firebase/firestore';


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

const Section = ({ children, className = "", id = "" }: { children: React.ReactNode, className?: string, id?: string }) => (
  <section id={id} className={`min-h-screen flex flex-col items-center justify-center relative px-6 py-24 overflow-hidden ${className}`}>
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

const InvitationGate = ({ onAccess }: { onAccess: (guest: any) => void, key?: string }) => {
  const [requestSent, setRequestSent] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  const [requestForm, setRequestForm] = useState({
  fullName: '',
  side: 'bride',
  note: '',
  });

  const handleRequestInvitation = async () => {
  try {
    setRequestLoading(true);

    await fetch(
      'https://requestinvitation-qomrrcjcla-uc.a.run.app',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: requestForm.fullName,
          side: requestForm.side,
          note: requestForm.note,
        }),
      }
    );

    // setRequestSent(true);
    // setShowRequestForm(false);
    // setTimeout(() => {
    //   setShowRequestForm(false);
    // }, 300);

    setTimeout(() => {
      setShowRequestForm(false);
      setRequestLoading(false);
      setRequestSent(true);
    }, 500);


    setError(
      'Permintaan undangan berhasil dikirim. Silakan tunggu dan coba lagi nanti ya :)'
    );
  } catch (err) {
    console.error(err);
    setError('Terjadi kesalahan saat mengirim permintaan.');
  } finally {
    setLoading(false);
  }
  };

  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Query using lowercase name for case-insensitive search
      const inputName = name.trim().toLowerCase();
      // We try to find by 'name' or 'name_lowercase'
      const q = query(collection(db, 'guests'), where('name', '==', inputName));
      
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'guests');
        return; // handleFirestoreError throws, but TS might need this
      }

      if (querySnapshot && !querySnapshot.empty) {
        const guestDoc = querySnapshot.docs[0];
        const guestData = { id: guestDoc.id, ...guestDoc.data() };
        onAccess(guestData);
      } else {
          setRequestForm({
            fullName: name,
            side: 'bride',
            note: '',
          });

          setShowRequestForm(true);

        // setError('Maaf, nama Anda tidak terdaftar dalam daftar tamu kami.');
      //   try {
      //     await fetch(
      //       'https://requestinvitation-qomrrcjcla-uc.a.run.app',
      //       {
      //         method: 'POST',
      //         headers: {
      //         'Content-Type': 'application/json',
      //         },
      //       body: JSON.stringify({
      //         name,
      //       }),
      //     }
      //   );
      //   setRequestForm(prev => ({...prev, fullName: name}));
      //   setRequestSent(true);
      //   // setError('Maaf, nama Anda tidak terdaftar dalam daftar tamu kami. Tapi kami sudah infokan tim untuk menambahkan nama anda. silahkan tunggu dan coba lagi ya :)');
      // } catch (err) {
      //   console.error(err);
      //   setError('Terjadi kesalahan saat mengirim permintaan.');
      // }
    }
    } catch (err) {
      console.error('Error checking guest:', err);
      setError('Terjadi kesalahan saat mengecek nama. Silakan coba lagi.');
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
        <h1 className="font-serif text-4xl font-bold mb-4 text-slate-900 italic">Selamat Datang</h1>
        <p className="text-slate-500 mb-10 font-light">Silakan masukkan nama anda untuk membuka undangan.</p>
        
        <form onSubmit={handleAccess} className="space-y-6">
          <div className="relative">
            <input
              required
              type="text"
              className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-dusty-100 transition-all text-slate-900 text-center text-lg"
              placeholder="Nama Depan Anda (cth : roni, rosi)"
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

          <button
            disabled={loading}
            type="submit"
            className="w-full py-4 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 font-display font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-slate-200"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" /> Buka Undangan
              </>
            )}
          </button>
        </form>
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
                  value={requestForm.fullName}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      fullName: e.target.value,
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
                  disabled={requestLoading}
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
    </div>
  );
};

export default function App() {
  const [guest, setGuest] = useState<any>(null);
  const [rsvpStatus, setRsvpStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [formData, setFormData] = useState({ name: '', guests: '1', message: '', attendance: [] as string[], isAttending: true });
  const containerRef = useRef<HTMLDivElement>(null);
  const [guestMessages, setGuestMessages] = useState<any[]>([]);

  const brideName = "Refi";
  const groomName = "Widhar";
  const orderedNames = guest?.side === 'groom' ? `${groomName} & ${brideName}` : `${brideName} & ${groomName}`;

  const eventDetails = {
    bride: {
      receptionDate: "2026-05-30T07:00:00.000+07:00",
      displayDate: "Minggu, 30 Mei 2026",
      displayTime: "10:00 - Selesai WIB",
      locationName: "Aula Kelurahan Doko",
      locationAddress: "Jl. Dandang Gendis No.279, Sumber, Doko, Kec. Ngasem, Kabupaten Kediri",
      mapUrl: "https://maps.app.goo.gl/CB5adRU6wNCeUmtY6"
    },
    groom: {
      receptionDate: "2026-05-30T07:00:00.000+07:00",
      displayDate: "Minggu, 31 Mei 2026",
      displayTime: "10:00 - Selesai WIB",
      locationName: "Kediaman Mempelai Pria",
      locationAddress: "Jl. Gunung Agung No.189, Dermo, Kec. Mojoroto, Kota Kediri",
      mapUrl: "https://maps.app.goo.gl/RW5HRxhWbJjkT95q7"
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
        name: guest.name,
        guests: guest.guestsCount?.toString() || '1',
        message: guest.message || '',
        isAttending: guest.isAttending ?? true,
        attendance: guest.attendance || []
      });
      // If guest has already confirmed, show success state
      // if (guest.isAttending) {
      //   setRsvpStatus('success');
      // }
      if (guest.hasResponded) {
        setRsvpStatus('success');
      }
    }
  }, [guest]);

  const handleRSVP = async (e: React.FormEvent) => {
    e.preventDefault();
    setRsvpStatus('submitting');
    
    try {
      if (guest?.id) {
        const guestRef = doc(db, 'guests', guest.id);
        try {
          // await updateDoc(guestRef, {
          //   isAttending: formData.isAttending,
          //   guestsCount: formData.isAttending ? parseInt(formData.guests) : 0,
          //   message: formData.message,
          //   attendance: formData.isAttending ? formData.attendance : [],
          //   updatedAt: new Date(),
          // });
          await updateDoc(guestRef, {
            hasResponded: true,
            isAttending: formData.isAttending,
            guestsCount: formData.isAttending
              ? parseInt(formData.guests)
              : 0,
            message: formData.message,
            attendance: formData.isAttending
              ? formData.attendance
              : [],
            updatedAt: new Date(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `guests/${guest.id}`);
        }
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
      'DESCRIPTION:Kami mengundang Anda untuk merayakan awal perjalanan baru kami dalam ikatan suci pernikahan.',
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
      'DESCRIPTION:Kami mengundang Anda untuk merayakan awal perjalanan baru kami dalam ikatan suci pernikahan.',
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

  return (
    <div ref={containerRef} className="font-sans selection:bg-rose-100 bg-white">
      <AnimatePresence mode="wait">
        {!guest ? (
          <InvitationGate key="gate" onAccess={setGuest} />
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative"
          >
            {/* Envelope Opening Transition */}
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: "-100%" }}
              transition={{ duration: 1.8, ease: [0.65, 0, 0.35, 1], delay: 0.2 }}
              className="fixed inset-x-0 top-0 h-1/2 bg-white z-[100] flex items-end justify-center pb-6 border-b border-slate-100 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center border border-slate-100 shadow-sm">
                <Heart className="w-6 h-6 text-rose-300 fill-rose-50" />
              </div>
            </motion.div>
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: "100%" }}
              transition={{ duration: 1.8, ease: [0.65, 0, 0.35, 1], delay: 0.2 }}
              className="fixed inset-x-0 bottom-0 h-1/2 bg-white z-[100] border-t border-slate-100 shadow-2xl"
            />

            {/* Progress Bar */}
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
                <h1 className="font-serif text-5xl md:text-7xl font-bold mb-4 tracking-tight text-slate-900 italic">
                  {orderedNames}
                </h1>
                <p className="text-slate-400 font-display text-xs tracking-widest uppercase mb-8">Kepada Yth. {guest.name}</p>
                <p className="text-lg md:text-xl text-slate-500 font-light max-w-xl mx-auto leading-relaxed">
                  Kami mengundang Anda untuk merayakan awal perjalanan baru kami dalam ikatan suci pernikahan.
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
                  "Maha suci Allah yang telah menciptakan makhluk-Nya berpasang-pasangan. Ya Allah, perkenankanlah kami merangkai kasih sayang yang Kau ciptakan dalam ikatan suci pernikahan."
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
                        <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div>
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
                        <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div>
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
                        <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div>
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
                        <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center">
                          <Heart className="w-5 h-5 text-dusty-600 fill-dusty-50" />
                        </div>
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

          {/* The Story */}
          <Section id="story" className="bg-sage-50">
            <div className="max-w-3xl mx-auto text-center z-10">
              <div className="glass p-10 md:p-20 rounded-3xl">
                <h2 className="font-serif text-3xl font-bold mb-10 text-slate-900 italic">Kisah Kami</h2>
                <div className="space-y-8 text-lg text-slate-600 leading-relaxed font-light">
                  <p>
                    Berawal dari sebuah pertemuan sederhana yang tak terduga, kami menemukan kecocokan yang membawa kami pada perjalanan indah ini.
                  </p>
                  <p>
                    Setelah melewati berbagai momen bersama, kami memutuskan untuk melangkah ke jenjang yang lebih serius dan membangun masa depan bersama.
                  </p>
                  <p className="font-serif italic text-dusty-600 text-xl">
                    "Cinta bukan tentang berapa lama kita mengenal, tapi tentang bagaimana kita saling melengkapi."
                  </p>
                </div>
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
                  className="glass p-8 md:p-12 rounded-[2.5rem] flex flex-col items-center text-center relative overflow-hidden"
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
                        href="https://maps.app.goo.gl/CB5adRU6wNCeUmtY6" 
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
                  className="glass p-8 md:p-12 rounded-[2.5rem] flex flex-col items-center text-center relative overflow-hidden"
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
              <div className="glass p-10 md:p-14 rounded-3xl shadow-lg shadow-dusty-100/20">
                <div className="text-center mb-12">
                  <h2 className="font-serif text-3xl font-bold mb-4 text-slate-900 italic">Konfirmasi Kehadiran</h2>
                  <p className="text-slate-500 font-light">Mohon konfirmasi kehadiran Anda sebelum tanggal 20 Mei 2026</p>
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
                      <h3 className="text-xl font-bold mb-2 text-slate-900">Terima Kasih!</h3>
                      {/* <p className="text-slate-500 font-light">Konfirmasi Anda telah kami terima.</p> */}
                      <p className="text-slate-500 font-light">Konfirmasi Anda telah kami terima.</p>

                      {!formData.isAttending && (
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

                          {/* <div className="space-y-4">
                            <div className="bg-white rounded-2xl border border-slate-100 p-4">
                              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                                BCA
                              </p>

                              <p className="text-lg font-semibold text-slate-900 tracking-wide">
                                1234567890
                              </p>

                              <p className="text-sm text-slate-500">
                                a.n. Refi Septiningtyas
                              </p>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-100 p-4">
                              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                                Mandiri
                              </p>

                              <p className="text-lg font-semibold text-slate-900 tracking-wide">
                                9876543210
                              </p>

                              <p className="text-sm text-slate-500">
                                a.n. Widhar Dwiatmoko
                              </p>
                            </div>
                          </div> */}
                          <div className="space-y-4">
                            {guest?.side === 'groom' ? (
                              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                                <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                                  BCA
                                </p>

                                <p className="text-lg font-semibold text-slate-900 tracking-wide">
                                  0153953918
                                </p>

                                <p className="text-sm text-slate-500">
                                  a.n. Widhar Dwiatmoko
                                </p>
                              </div>
                            ) : (
                              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                                <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                                  BRI
                                </p>

                                <p className="text-lg font-semibold text-slate-900 tracking-wide">
                                  XXXXXX
                                </p>

                                <p className="text-sm text-slate-500">
                                  a.n. Refi Septiningtyas
                                </p>
                              </div>
                            )}
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

                      <button 
                        onClick={() => setRsvpStatus('idle')}
                        className="mt-8 text-slate-400 hover:text-slate-600 underline underline-offset-4 text-sm"
                      >
                        Kirim konfirmasi lain
                      </button>
                    </motion.div>
                  ) : (
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
                          onClick={() =>
                            setFormData({
                              ...formData,
                              isAttending: true
                            })
                          }
                          className={`
                            py-4 rounded-2xl border transition-all
                            ${
                              formData.isAttending
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-500 border-slate-200'
                            }
                          `}
                        >
                          Hadir
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              isAttending: false,
                              attendance: []
                            })
                          }
                          className={`
                            py-4 rounded-2xl border transition-all
                            ${
                              !formData.isAttending
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-500 border-slate-200'
                            }
                          `}
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
                        <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Nama Lengkap</label>
                        <input
                          required
                          type="text"
                          className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-dusty-100 transition-all text-slate-900"
                          placeholder="Masukkan nama Anda"
                          value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                      </div>
                      <div>
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
                      </div>
                        </>
                      )}
                      <div>
                        <label className="block text-[10px] font-display uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">Pesan untuk Mempelai</label>
                        <textarea
                          rows={3}
                          className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-dusty-100 transition-all text-slate-900"
                          placeholder="Tuliskan ucapan atau doa..."
                          value={formData.message}
                          onChange={e => setFormData({...formData, message: e.target.value})}
                        />
                      </div>

                      <button
                        // disabled={rsvpStatus === 'submitting' || formData.attendance.length === 0}
                        // disabled={rsvpStatus === 'submitting' || formData.attendance.length === 0}
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
        <Section className="bg-white">
          <div className="max-w-3xl mx-auto w-full z-10">
            <div className="text-center mb-14">
              <h2 className="font-serif text-3xl font-bold text-slate-900 italic mb-4">
                Ucapan & Doa
              </h2>

              <p className="text-slate-500 font-light">
                Kehangatan dari keluarga dan sahabat
              </p>
            </div>

            <div className="space-y-4">
              <AnimatePresence>
                {guestMessages.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.5,
                      delay: index * 0.03,
                    }}
                    className="bg-slate-50 border border-slate-100 rounded-3xl p-6"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {item.name}
                        </h3>

                        <p className="text-xs text-slate-400">
                          {/* {item.guestsCount || 1} tamu */}
                          {item.isAttending ? `${item.guestsCount ?? 1} tamu` : ''}
                        </p>
                      </div>

                      <Heart className="w-4 h-4 text-rose-300 fill-rose-100 shrink-0 mt-1" />
                    </div>

                    <p className="text-slate-600 leading-relaxed font-light">
                      "{item.message}"
                    </p>

                    <div className="flex flex-wrap gap-2 mt-4">
                      <span
                        className={`
                          px-3 py-1 rounded-full text-[10px] uppercase tracking-wider border
                          ${
                            item.isAttending
                              ? 'bg-sage-50 text-sage-600 border-sage-100'
                              : 'bg-rose-50 text-rose-500 border-rose-100'
                          }
                        `}
                      >
                        {item.isAttending ? 'Hadir' : 'Tidak Hadir'}
                      </span>

                      {item.isAttending &&
                        item.attendance?.map((event: string) => (
                          <span
                            key={event}
                            className="
                              px-3 py-1
                              rounded-full
                              bg-white
                              border border-slate-100
                              text-[10px]
                              uppercase
                              tracking-wider
                              text-slate-500
                            "
                          >
                            {event}
                          </span>
                        ))}
                    </div>

                    {/* {item.attendance?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {item.attendance.map((event: string) => (
                          <span
                            key={event}
                            className="
                              px-3 py-1
                              rounded-full
                              bg-white
                              border border-slate-100
                              text-[10px]
                              uppercase
                              tracking-wider
                              text-slate-500
                            "
                          >
                            {event}
                          </span>
                        ))}
                      </div>
                    )} */}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </Section>

          {/* Footer */}
          <footer className="py-24 text-center bg-cream-50 border-t border-cream-100">
            <div className="max-w-xs mx-auto">
              <p className="font-display text-[10px] tracking-[0.5em] uppercase text-slate-300 mb-8">Terima Kasih</p>
              <Heart className="w-5 h-5 text-dusty-600 fill-dusty-100 mx-auto mb-8" />
              <p className="text-slate-400 font-light text-sm leading-relaxed italic font-serif">
                Merupakan suatu kehormatan bagi kami jika Anda berkenan hadir dan memberikan doa restu.
              </p>
            </div>
          </footer>

          {/* Floating Navigation */}
          <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
            <div className="glass px-8 py-4 rounded-full flex items-center gap-10 shadow-xl shadow-slate-200/50">
              <a href="#" className="text-slate-400 hover:text-dusty-600 transition-colors"><Heart className="w-4 h-4" /></a>
              <a href="#story" className="text-slate-400 hover:text-dusty-600 transition-colors font-display text-[10px] uppercase tracking-[0.3em]">Kisah</a>
              <a href="#details" className="text-slate-400 hover:text-dusty-600 transition-colors font-display text-[10px] uppercase tracking-[0.3em]">Detail</a>
              <a href="#rsvp" className="text-slate-400 hover:text-dusty-600 transition-colors font-display text-[10px] uppercase tracking-[0.3em]">RSVP</a>
            </div>
          </nav>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
