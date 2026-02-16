import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

const createUploadMiddleware = (subfolder: string) => {
  const uploadDir = path.join(process.cwd(), `uploads/${subfolder}`);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `${subfolder}-${uniqueSuffix}${ext}`);
    },
  });

  return multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error("Only image files are allowed!"));
      }
      cb(null, true);
    },
  });
};

export const uploadReceipt = createUploadMiddleware("receipts");
export const uploadMenuImage = createUploadMiddleware("menu");
// Default export for backward compatibility if needed, or just named exports
export const uploadMiddleware = uploadReceipt;
