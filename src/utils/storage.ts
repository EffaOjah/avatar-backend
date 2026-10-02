import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type StorageBucket = 'avatars' | 'businesses' | 'categories' | 'products';

/**
 * Uploads a file buffer to a Supabase Storage bucket.
 * Returns the public URL of the uploaded file.
 */
export const uploadFile = async (
  bucket: StorageBucket,
  path: string,
  buffer: Buffer,
  mimetype: string
): Promise<string> => {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: mimetype,
      upsert: true, // Overwrite if the file already exists
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

/**
 * Deletes a file from a Supabase Storage bucket.
 */
export const deleteFile = async (bucket: StorageBucket, path: string): Promise<void> => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
};
