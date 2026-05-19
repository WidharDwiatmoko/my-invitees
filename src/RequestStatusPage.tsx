import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Search, ArrowLeft, Clock, CheckCircle2, AlertCircle, Copy, Check, Loader2 } from 'lucide-react';
import { db } from './firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface RequestStatusPageProps {
  onBack: () => void;
  onOpenInvitation: () => void;
}

export default function RequestStatusPage({ onBack, onOpenInvitation }: RequestStatusPageProps) {
  const [statusCode, setStatusCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestData, setRequestData] = useState<any>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copied, setCopied] = useState(false);

  // Otomatis lacak jika ada kode di URL query string (?status&code=XXXX-1234)
  useEffect(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get('code');
      if (codeParam) {
        const cleanCode = codeParam.trim().toUpperCase();
        setStatusCode(cleanCode);
        handleTrackStatus(cleanCode);
      }
    }, []);
    const handleTrackStatus = (codeToSearch: string) => {
      if (!codeToSearch.trim()) return;
      
      setLoading(true);
      setHasSearched(true);

      const targetCode = codeToSearch.trim().toUpperCase();

      const q = query(
        collection(db, 'invitation_requests'),
        where('statusCode', '==', targetCode)
      );

      // Ambil data tanpa menyimpan fungsi unsubscribe ke variabel lokal yang langsung mematikan dirinya sendiri
      onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setRequestData({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
        } else {
          setRequestData(null);
        }
        setLoading(false);
      }, (error) => {
        console.error("Error fetching status:", error);
        setLoading(false);
      });
    };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(statusCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#f5f4f0] overflow-y-auto px-4 py-12 flex flex-col items-center">
      <div className="max-w-xl w-full">
        
        {/* Header Navigation */}
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-xs font-display uppercase tracking-widest mb-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali Ke Awal
        </button>

        {/* Title */}
        <div className="text-center mb-10">
          <Heart className="w-10 h-10 text-dusty-600 fill-dusty-100 mx-auto mb-4" />
          <h1 className="font-serif text-3xl font-bold text-slate-900 italic mb-2">Pelacakan Undangan</h1>
          <p className="text-sm text-slate-500 font-light">Pantau status pengajuan kode akses undangan pernikahan kami.</p>
        </div>

        {/* Search Input Box */}
        <form 
          onSubmit={(e) => {
            e.preventDefault(); // Mencegah halaman refresh bawaan browser
            handleTrackStatus(statusCode);
          }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm mb-6 flex gap-3 items-center"
        >
          <div className="relative flex-1">
            <input 
              type="text"
              placeholder="Masukkan Kode Status Anda (Cth: REFI-1234)"
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 text-slate-900 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-slate-900/5 transition-all text-sm uppercase placeholder:normal-case placeholder:font-sans placeholder:tracking-normal"
            />
          </div>
          <button
            type="submit" // <-- Ubah type menjadi submit
            disabled={loading || !statusCode.trim()}
            className="p-3.5 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-40 shadow-md shadow-slate-900/10"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </button>
        </form>

        {/* Results Container */}
        <AnimatePresence mode="wait">
          {loading && !requestData && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center py-12 text-slate-400 text-sm font-light"
            >
              Sedang memuat data dari server...
            </motion.div>
          )}

          {!loading && hasSearched && !requestData && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-8 border border-slate-200/60 text-center shadow-sm"
            >
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-3" />
              <p className="text-slate-800 font-medium mb-1">Kode Tidak Ditemukan</p>
              <p className="text-xs text-slate-400 font-light leading-relaxed max-w-xs mx-auto">
                Periksa kembali kombinasi huruf dan angka pada kode status Anda. Pastikan tidak ada salah ketik.
              </p>
            </motion.div>
          )}

          {!loading && requestData && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* STATUS CARD SUMMARY */}
              <div className={`rounded-3xl p-6 border flex items-start gap-4 shadow-sm transition-colors ${
                requestData.approved 
                  ? 'bg-emerald-50/60 border-emerald-100 text-emerald-900' 
                  : 'bg-amber-50/60 border-amber-100 text-amber-900'
              }`}>
                {requestData.approved ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
                ) : (
                  <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h3 className="font-semibold text-base mb-1">
                    {requestData.approved ? 'Permintaan Disetujui' : 'Menunggu Persetujuan'}
                  </h3>
                  <p className="text-xs opacity-75 font-light leading-relaxed">
                    {requestData.approved 
                      ? 'Selamat! Nama Anda sudah didaftarkan oleh pengantin. Anda sekarang bisa membuka gerbang undangan utama.' 
                      : 'Data Anda telah tersimpan ke sistem. Mohon tunggu pengantin memverifikasi data dan menyetujui akses Anda.'}
                  </p>
                  
                  {requestData.approved && (
                    <button
                      onClick={onOpenInvitation}
                      className="mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-display uppercase tracking-wider font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-700/10"
                    >
                      Buka Undangan Sekarang →
                    </button>
                  )}
                </div>
              </div>

              {/* DETAILS TABLE */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <span className="font-display text-[10px] uppercase tracking-widest text-slate-400 font-bold">Rincian Informasi</span>
                  <button 
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 text-[10px] font-display uppercase tracking-wider text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" /> Berhasil Di Salin!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Salin Kode
                      </>
                    )}
                  </button>
                </div>

                <div className="divide-y divide-slate-100 text-sm">
                  {/* Row 1: Kode */}
                  <div className="grid grid-cols-3 p-4 px-6 items-center">
                    <div className="text-slate-400 font-light text-xs uppercase tracking-wider">Kode Lacak</div>
                    <div className="col-span-2 text-slate-900 font-mono font-bold tracking-wider">{requestData.statusCode}</div>
                  </div>

                  {/* Row 2: Nama Lengkap */}
                  <div className="grid grid-cols-3 p-4 px-6 items-center">
                    <div className="text-slate-400 font-light text-xs uppercase tracking-wider">Nama Anda</div>
                    <div className="col-span-2 text-slate-900 font-medium capitalize">{requestData.originalName}</div>
                  </div>

                  {/* Row Tambahan: Nama Akses / Login (Hanya muncul jika di-approve) */}
                  {requestData.approved && (
                    <div className="grid grid-cols-3 p-4 px-6 items-center bg-slate-50">
                      <div className="text-slate-400 font-light text-xs uppercase tracking-wider">Akses Masuk</div>
                      <div className="col-span-2">
                        <span className="inline-block px-3 py-1 rounded-lg bg-slate-200/50 text-slate-800 font-mono font-bold tracking-widest text-xs">
                          {requestData.originalName.trim().split(' ')[0].toLowerCase()}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-light">
                          *Gunakan nama di atas untuk membuka undangan
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Row 3: Sisi Tamu */}
                  <div className="grid grid-cols-3 p-4 px-6 items-center">
                    <div className="text-slate-400 font-light text-xs uppercase tracking-wider">Tamu Dari</div>
                    <div className="col-span-2 text-slate-900">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                        {requestData.side === 'bride' ? 'Refi (Mempelai Wanita)' : 'Widhar (Mempelai Pria)'}
                      </span>
                    </div>
                  </div>

                  {/* Row 4: Keterangan */}
                  <div className="grid grid-cols-3 p-4 px-6 items-start">
                    <div className="text-slate-400 font-light text-xs uppercase tracking-wider mt-0.5">Keterangan</div>
                    <div className="col-span-2 text-slate-600 font-light text-xs leading-relaxed">{requestData.note || '-'}</div>
                  </div>

                  {/* Row 5: Waktu Request */}
                  <div className="grid grid-cols-3 p-4 px-6 items-center">
                    <div className="text-slate-400 font-light text-xs uppercase tracking-wider">Dikirim Pada</div>
                    <div className="col-span-2 text-slate-500 text-xs">{formatDate(requestData.createdAt)}</div>
                  </div>

                  {/* Row 6: Waktu Approved (Hanya muncul jika approved) */}
                  {requestData.approved && (
                    <div className="grid grid-cols-3 p-4 px-6 items-center bg-emerald-50/10">
                      <div className="text-emerald-600/80 font-medium text-xs uppercase tracking-wider">Disetujui Pada</div>
                      <div className="col-span-2 text-emerald-700 text-xs font-medium">{formatDate(requestData.approvedAt)}</div>
                    </div>
                  )}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}