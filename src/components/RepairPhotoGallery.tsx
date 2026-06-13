import { useState, useRef } from 'react';
import type { RepairPhoto } from '../types';
import { uploadPhoto, deletePhoto } from '../utils/uploadToSupabase';
import * as api from '../utils/api';

interface Props {
    repairId: string;
    photosBefore: RepairPhoto[];
    photosAfter: RepairPhoto[];
    onUpdate: (before: RepairPhoto[], after: RepairPhoto[]) => void;
    readonly?: boolean;
}

export default function RepairPhotoGallery({ repairId, photosBefore, photosAfter, onUpdate, readonly }: Props) {
    const [uploading, setUploading] = useState<'before' | 'after' | null>(null);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const beforeRef = useRef<HTMLInputElement>(null);
    const afterRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (files: FileList, type: 'before' | 'after') => {
        setUploading(type);
        try {
            const uploaded: RepairPhoto[] = [];
            for (const file of Array.from(files)) {
                try {
                    // Upload to Supabase Storage
                    const url = await uploadPhoto('repair-photos', file, `${repairId}/${type}`);
                    const photo: RepairPhoto = {
                        id: Date.now().toString() + Math.random().toString(36).slice(2),
                        url,
                        uploadedAt: new Date().toISOString(),
                        type,
                    };
                    uploaded.push(photo);
                    // Save to DB
                    await api.saveRepairPhoto(repairId, photo);
                } catch (err) {
                    console.error('Photo upload failed:', err);
                }
            }
            if (type === 'before') onUpdate([...photosBefore, ...uploaded], photosAfter);
            else onUpdate(photosBefore, [...photosAfter, ...uploaded]);
        } finally {
            setUploading(null);
        }
    };

    const handleDelete = async (photo: RepairPhoto, type: 'before' | 'after') => {
        try {
            await deletePhoto('repair-photos', photo.url);
            await api.deleteRepairPhoto(photo.id);
        } catch (err) {
            console.error('Photo delete failed:', err);
        }
        if (type === 'before') onUpdate(photosBefore.filter(p => p.id !== photo.id), photosAfter);
        else onUpdate(photosBefore, photosAfter.filter(p => p.id !== photo.id));
    };

    const PhotoSection = ({ title, photos, type, inputRef }: {
        title: string; photos: RepairPhoto[]; type: 'before' | 'after'; inputRef: React.RefObject<HTMLInputElement | null>;
    }) => (
        <div className="flex-1">
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-white">{title}</h4>
                {!readonly && (
                    <button onClick={() => inputRef.current?.click()} disabled={uploading === type}
                        className="px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-sm hover:bg-primary/30 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">add_photo_alternate</span>
                        {uploading === type ? 'Yükleniyor...' : 'Fotoğraf Ekle'}
                    </button>
                )}
            </div>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => e.target.files && handleUpload(e.target.files, type)} />
            <div className="grid grid-cols-3 gap-2">
                {photos.map(photo => (
                    <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-800 cursor-pointer"
                        onClick={() => setLightbox(photo.url)}>
                        <img src={photo.url} alt="" className="w-full h-full object-cover" />
                        {!readonly && (
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                                <button onClick={e => { e.stopPropagation(); handleDelete(photo, type); }}
                                    className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm">
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {photos.length === 0 && (
                    <div className="aspect-square rounded-lg bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center col-span-3">
                        <p className="text-slate-500 text-sm">Fotoğraf yok</p>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <PhotoSection title="🔴 Hasarlı Hali (Önce)" photos={photosBefore} type="before" inputRef={beforeRef} />
                <PhotoSection title="✅ Tamir Sonrası (Sonra)" photos={photosAfter} type="after" inputRef={afterRef} />
            </div>
            {lightbox && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
                    <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl" onClick={e => e.stopPropagation()} />
                    <button onClick={() => setLightbox(null)}
                        className="absolute top-4 right-4 w-10 h-10 bg-black/50 rounded-full text-white flex items-center justify-center">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            )}
        </div>
    );
}
