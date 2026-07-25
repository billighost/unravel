/**
 * CLOUDINARY MEDIA UPLOAD UTILITY
 * 
 * Handles uploading thumbnail images to Cloudinary with automatic size and format transformations.
 * Includes fallback to standard data URIs when Cloudinary credentials are omitted in development.
 */

import { v2 as cloudinary } from 'cloudinary';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export async function uploadThumbnailToCloudinary(base64DataUrl: string): Promise<string> {
  // Fallback if base64 is invalid or empty
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) {
    return base64DataUrl || '';
  }

  // Fallback to direct data URL if Cloudinary is not configured
  if (!cloudName || !apiKey || !apiSecret) {
    return base64DataUrl;
  }

  try {
    const res = await cloudinary.uploader.upload(base64DataUrl, {
      folder: 'unravel_creations',
      transformation: [
        { width: 400, height: 300, crop: 'fit', quality: 'auto', fetch_format: 'auto' },
      ],
    });
    return res.secure_url;
  } catch (err) {
    console.warn('Cloudinary upload failed, returning raw thumbnail fallback:', err);
    return base64DataUrl;
  }
}
