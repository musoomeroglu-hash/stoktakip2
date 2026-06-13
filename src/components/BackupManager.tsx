import { useState, useRef, useEffect } from 'react';
import * as api from '../utils/api';

export default function BackupManager() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [backups, setBackups] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingList, setLoadingList] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [autoBackup, setAutoBackup] = useState(localStorage.getItem('autoBackup') === 'true');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadBackups = async () => {
        setLoadingList(true);
        try {
            const list = await api.getBackupsList();
            setBackups(list || []);
        } catch (err) {
            console.error('Yedek listesi alınamadı:', err);
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        loadBackups();
    }, []);

    const handleBackup = async (toCloud: boolean = true) => {
        setLoading(true);
        try {
            await api.triggerManualBackup(toCloud);
            alert(`✅ Yedekleme (${toCloud ? 'Bulut' : 'Cihaz'}) tamamlandı!`);
            if (toCloud) loadBackups();
        } catch (err: unknown) {
            alert(`❌ Hata: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleRestoreFromFile = async (file: File) => {
        if (!confirm('⚠️ DİKKAT: Mevcut veriler yedek ile birleştirilecek (upsert). Devam etmek istiyor musunuz?')) return;
        setRestoring(true);
        try {
            await api.restoreFromBackup(file);
            alert('✅ Geri yükleme başarılı! Lütfen sayfayı yenileyin.');
        } catch (err: unknown) {
            alert(`❌ Geri yükleme hatası: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        } finally {
            setRestoring(false);
        }
    };

    const handleRestoreFromCloud = async (fileName: string) => {
        if (!confirm('⚠️ DİKKAT: Bu bulut yedeği mevcut verilerle birleştirilecek. Devam edilsin mi?')) return;
        setRestoring(true);
        try {
            const file = await api.downloadBackupFromSupabase(fileName);
            await api.restoreFromBackup(file);
            alert('✅ Buluttan geri yükleme başarılı! Lütfen sayfayı yenileyin.');
        } catch (err: unknown) {
            alert(`❌ Geri yükleme hatası: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        } finally {
            setRestoring(false);
        }
    };

    const handleDeleteBackup = async (fileName: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await api.deleteBackupFromSupabase(fileName);
            setBackups(prev => prev.filter(b => b.name !== fileName));
        } catch (err) {
            alert('Silinemedi');
        }
    };

    const handleDownloadCloudBackup = async (fileName: string) => {
        try {
            const file = await api.downloadBackupFromSupabase(fileName);
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('İndirilemedi');
        }
    };

    const toggleAutoBackup = (val: boolean) => {
        setAutoBackup(val);
        localStorage.setItem('autoBackup', String(val));
        if (val) {
            alert('Otomatik yedekleme açıldı. Uygulamaya her gün ilk girişinizde arka planda bir bulut yedeği oluşturulacaktır.');
            // Test if we need to backup right now
            const lastBackupDate = localStorage.getItem('lastAutoBackupDate');
            const today = new Date().toISOString().split('T')[0];
            if (lastBackupDate !== today) {
                // Background trigger
                api.triggerManualBackup(true).then(() => {
                    localStorage.setItem('lastAutoBackupDate', today);
                    loadBackups();
                }).catch(console.error);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-surface rounded-2xl p-6">
                <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">cloud_sync</span>
                    Veri Yedekleme
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button onClick={() => handleBackup(true)} disabled={loading}
                        className="flex flex-col items-center gap-2 p-4 bg-primary/10 border border-primary/30 rounded-xl hover:bg-primary/20 transition-colors disabled:opacity-50">
                        <span className="material-symbols-outlined text-primary text-3xl">{loading ? 'progress_activity' : 'cloud_upload'}</span>
                        <span className="text-white font-medium text-sm text-center">{loading ? 'Yedekleniyor...' : 'Buluta Yedekle'}</span>
                    </button>
                    <button onClick={() => handleBackup(false)} disabled={loading}
                        className="flex flex-col items-center gap-2 p-4 bg-slate-700/50 border border-slate-600 rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-50">
                        <span className="material-symbols-outlined text-slate-300 text-3xl">download</span>
                        <span className="text-white font-medium text-sm text-center">Cihaza İndir</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} disabled={restoring}
                        className="flex flex-col items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl hover:bg-yellow-500/20 transition-colors disabled:opacity-50">
                        <span className="material-symbols-outlined text-yellow-400 text-3xl">restore_page</span>
                        <span className="text-white font-medium text-sm text-center">{restoring ? 'Geri Yükleniyor...' : 'Dosyadan Yükle'}</span>
                    </button>
                    <input ref={fileInputRef} type="file" accept=".json" className="hidden"
                        onChange={e => e.target.files?.[0] && handleRestoreFromFile(e.target.files[0])} />
                    <div className="flex flex-col items-center justify-center gap-2 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                        <span className="material-symbols-outlined text-green-400 text-3xl">cloud_sync</span>
                        <span className="text-white font-medium text-sm">Oto Bulut Yedeği</span>
                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <div onClick={() => toggleAutoBackup(!autoBackup)}
                                className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${autoBackup ? 'bg-green-500' : 'bg-slate-600'}`}>
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${autoBackup ? 'left-5' : 'left-0.5'}`} />
                            </div>
                            <span className="text-slate-400 text-xs">{autoBackup ? 'Açık (Günlük)' : 'Kapalı'}</span>
                        </label>
                    </div>
                </div>
            </div>
            <div className="bg-surface rounded-2xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="p-5 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">cloud_done</span>
                        Bulut Yedek Geçmişi
                    </h3>
                    <button onClick={loadBackups} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-surface-hover">
                        <span className={`material-symbols-outlined text-xl ${loadingList ? 'animate-spin' : ''}`}>sync</span>
                    </button>
                </div>
                {loadingList ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <span className="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
                    </div>
                ) : backups.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
                        <span className="material-symbols-outlined text-5xl mb-3 text-slate-600">cloud_off</span>
                        <p>Bulutta henüz yedek bulunmuyor.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800 flex-1 overflow-y-auto max-h-[400px]">
                        {backups.map((log) => (
                            <div key={log.id || log.name} className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-4 hover:bg-slate-800/30 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-green-400 text-2xl">
                                        check_circle
                                    </span>
                                    <div>
                                        <p className="text-white text-sm font-medium">{log.name}</p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-slate-400 text-xs">
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">event</span>
                                                {new Date(log.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">save</span>
                                                {(log.metadata?.size / 1024).toFixed(1)} KB
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleDownloadCloudBackup(log.name)} title="Cihaza İndir"
                                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
                                        <span className="material-symbols-outlined text-lg">download</span>
                                    </button>
                                    <button onClick={() => handleRestoreFromCloud(log.name)} title="Yedekten Geri Yükle" disabled={restoring}
                                        className="p-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 rounded-lg transition-colors disabled:opacity-50">
                                        <span className="material-symbols-outlined text-lg">restore</span>
                                    </button>
                                    <button onClick={() => handleDeleteBackup(log.name)} title="Sil"
                                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-colors">
                                        <span className="material-symbols-outlined text-lg">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
