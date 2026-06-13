// Supabase Storage Upload Utility
// Fotoğraf upload/delete işlemleri için

const SUPABASE_URL = 'https://xtjvbkhappiceyrlovkx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0anZia2hhcHBpY2V5cmxvdmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NTUzNTksImV4cCI6MjA4MjIzMTM1OX0.bUSQ4nkoasOVQdtQwGSxtXiLGbyV9Ih8qlf-sGg3LCg';

/**
 * Upload a file to Supabase Storage
 * @param bucket - Storage bucket name (e.g. 'repair-photos', 'customer-photos')
 * @param file - File to upload
 * @param folder - Optional folder path within bucket
 * @returns Public URL of the uploaded file
 */
export async function uploadPhoto(bucket: string, file: File, folder?: string): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${folder ? folder + '/' : ''}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${fileName}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': file.type,
            'x-upsert': 'true',
        },
        body: file,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${res.status} - ${text}`);
    }

    // Return public URL
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`;
}

/**
 * Delete a file from Supabase Storage
 * @param bucket - Storage bucket name
 * @param filePath - Path to the file within the bucket
 */
export async function deletePhoto(bucket: string, filePath: string): Promise<void> {
    // Extract path from full URL if needed
    const path = filePath.includes('/storage/v1/object/public/')
        ? filePath.split(`/storage/v1/object/public/${bucket}/`)[1]
        : filePath;

    if (!path) return;

    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [path] }),
    });
}
