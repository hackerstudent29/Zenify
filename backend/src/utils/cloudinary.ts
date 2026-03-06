
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env';

const cloudinaryConfig: Record<string, any> = { secure: true };

if (config.CLOUDINARY_CLOUD_NAME) cloudinaryConfig.cloud_name = config.CLOUDINARY_CLOUD_NAME;
if (config.CLOUDINARY_API_KEY) cloudinaryConfig.api_key = config.CLOUDINARY_API_KEY;
if (config.CLOUDINARY_API_SECRET) cloudinaryConfig.api_secret = config.CLOUDINARY_API_SECRET;

cloudinary.config(cloudinaryConfig);
export default cloudinary;
