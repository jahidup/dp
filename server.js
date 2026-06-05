// server.js – FINAL PRODUCTION BACKEND (v13)
// OpenRouter streaming, Gemini fallback, MongoDB Atlas, Cloudinary, all CRUD
// Updated system prompt to ensure academic question answering

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const xss = require('xss');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

// ---------- ENVIRONMENT VARIABLES ----------
const {
  MONGODB_URI,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  JWT_SECRET,
  GEMINI_API_KEY,
  OPENROUTER_API_KEY,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  PORT = 3000
} = process.env;

// ---------- CLOUDINARY ----------
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// ---------- GEMINI ----------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const DEFAULT_BRANDING = {
  logoUrl: 'https://sankalpshiksha.com/wp-content/uploads/2025/07/SANKALP-SHIKSHA-N-LOGO-2048x415.png',
  faviconUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQfjBJILA9Yd-tJq3EUb-Ju1u61mkFh6_89XA&s',
  instituteName: 'Sankalp Digital Pathshala',
  primaryColor: '#00acee',
  darkModeLogoUrl: ''
};

const DEFAULT_RESULT_CATEGORIES = [
  { name: 'Class 10 Result', slug: 'class-10-result', mode: 'dynamic', active: true, sortOrder: 1 },
  { name: 'Class 12 Result', slug: 'class-12-result', mode: 'dynamic', active: true, sortOrder: 2 },
  { name: 'Scholarship Result', slug: 'scholarship-result', mode: 'pdf', active: true, sortOrder: 3 },
  { name: 'Mock Test', slug: 'mock-test', mode: 'link', active: true, sortOrder: 4 }
];

const DEFAULT_GALLERY_CATEGORIES = [
  { name: 'Smart Classes', slug: 'smart-classes', active: true, sortOrder: 1 },
  { name: 'Robotics Lab', slug: 'robotics-lab', active: true, sortOrder: 2 },
  { name: 'Campus Life', slug: 'campus-life', active: true, sortOrder: 3 },
  { name: 'Cultural Events', slug: 'cultural-events', active: true, sortOrder: 4 }
];

const DEFAULT_GALLERY = [
  {
    imageUrl: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=84',
    title: 'Smart Digital Classroom',
    caption: 'Interactive classroom designed for focused learning.',
    categorySlug: 'smart-classes',
    eventDate: '2026-04-12'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=84',
    title: 'Robotics and Innovation Lab',
    caption: 'Students explore sensors, code, and working prototypes.',
    categorySlug: 'robotics-lab',
    eventDate: '2026-03-18'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1529390079861-591de354faf5?auto=format&fit=crop&w=1200&q=84',
    title: 'Collaborative Learning Session',
    caption: 'Peer learning, mentoring, and guided practice.',
    categorySlug: 'campus-life',
    eventDate: '2026-02-25'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=84',
    title: 'Annual Day Celebration',
    caption: 'A stage for confidence, creativity, and community.',
    categorySlug: 'cultural-events',
    eventDate: '2026-01-29'
  }
];

// ---------- EXPRESS ----------
const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: 'Too many requests, please try again later.'
});
app.use(globalLimiter);

// ---------- MONGOOSE ----------
let cachedDb = null;
async function connectDB() {
  if (cachedDb && mongoose.connection.readyState === 1) return cachedDb;
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI is not configured. Running public APIs with demo data only.');
    return null;
  }
  const conn = await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  });
  cachedDb = conn;
  console.log('MongoDB connected');
  return conn;
}

// ======================== DATABASE MODELS ========================

const inquirySchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  mobile: { type: String, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new' },
  createdAt: { type: Date, default: Date.now }
});
inquirySchema.index({ status: 1, createdAt: -1 });
const Inquiry = mongoose.model('Inquiry', inquirySchema);

const aiLeadSchema = new mongoose.Schema({
  firstName: String,
  class: String,
  interest: String,
  phone: String,
  city: String,
  parentName: String,
  email: String,
  aiSummary: String,
  leadScore: { type: Number, min: 0, max: 100 },
  status: { type: String, enum: ['pending', 'contacted', 'converted'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});
aiLeadSchema.index({ status: 1, leadScore: -1 });
const AILead = mongoose.model('AILead', aiLeadSchema);

const aiQuestionSchema = new mongoose.Schema({
  type: { type: String, enum: ['text', 'image', 'pdf'], required: true },
  question: String,
  answer: String,
  createdAt: { type: Date, default: Date.now }
});
const AIQuestion = mongoose.model('AIQuestion', aiQuestionSchema);

const auditColumns = {
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
};

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  permissions: [String],
  ...auditColumns
});
const Role = mongoose.model('Role', roleSchema);

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  passwordHash: String,
  role: { type: String, enum: ['super_admin', 'admin', 'staff'], default: 'admin' },
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
  ...auditColumns
});
const User = mongoose.model('User', userSchema);

const studentSchema = new mongoose.Schema({
  registrationNumber: { type: String, required: true, unique: true },
  rollNumber: String,
  studentName: { type: String, required: true },
  fatherName: String,
  motherName: String,
  dob: Date,
  className: String,
  session: String,
  mobileNumber: String,
  address: String,
  schoolName: String,
  photoUrl: String,
  active: { type: Boolean, default: true },
  ...auditColumns
});
studentSchema.index({ rollNumber: 1 });
studentSchema.index({ studentName: 'text', registrationNumber: 'text', rollNumber: 'text' });
const Student = mongoose.model('Student', studentSchema);

const resultFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'number', 'date', 'select', 'photo', 'subjectTable', 'textarea'], default: 'text' },
  required: { type: Boolean, default: false },
  options: [String],
  validation: mongoose.Schema.Types.Mixed,
  order: { type: Number, default: 0 },
  conditional: mongoose.Schema.Types.Mixed
}, { _id: false });

const resultCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  mode: { type: String, enum: ['dynamic', 'pdf', 'link'], default: 'dynamic' },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  fields: [resultFieldSchema],
  searchFields: { type: [String], default: ['registrationNumber', 'dob'] },
  ...auditColumns
});
resultCategorySchema.index({ active: 1, sortOrder: 1 });
const ResultCategory = mongoose.model('ResultCategory', resultCategorySchema);

const subjectMarkSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  marksObtained: { type: Number, default: 0 },
  maxMarks: { type: Number, default: 100 },
  grade: String,
  remarks: String
}, { _id: false });

const resultSchema = new mongoose.Schema({
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'ResultCategory' },
  categorySlug: { type: String, default: 'class-10-result' },
  resultMode: { type: String, enum: ['dynamic', 'pdf', 'link'], default: 'dynamic' },
  registrationNumber: { type: String, required: true },
  rollNumber: { type: String, default: '' },
  studentName: { type: String, required: true },
  fatherName: { type: String, default: '' },
  motherName: { type: String, default: '' },
  dob: { type: Date, required: true },
  className: { type: String, default: '' },
  session: { type: String, default: '' },
  mobileNumber: String,
  address: String,
  schoolName: String,
  photoUrl: String,
  fields: { type: mongoose.Schema.Types.Mixed, default: {} },
  subjects: [subjectMarkSchema],
  totalMarks: { type: Number, default: 0 },
  maxMarks: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  grade: { type: String, default: '' },
  rank: { type: String, default: '' },
  remarks: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  externalUrl: { type: String, default: '' },
  verificationCode: { type: String, default: '' },
  published: { type: Boolean, default: false },
  issueDate: { type: Date, default: Date.now },
  downloadCount: { type: Number, default: 0 },
  lastAccessedAt: Date,
  ...auditColumns
});
resultSchema.index({ categorySlug: 1, registrationNumber: 1 });
resultSchema.index({ categorySlug: 1, rollNumber: 1 });
resultSchema.index({ registrationNumber: 'text', rollNumber: 'text', studentName: 'text' });
const Result = mongoose.model('Result', resultSchema);

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  image: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Event = mongoose.model('Event', eventSchema);

const galleryCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  featuredImageUrl: String,
  ...auditColumns
});
galleryCategorySchema.index({ active: 1, sortOrder: 1 });
const GalleryCategory = mongoose.model('GalleryCategory', galleryCategorySchema);

const gallerySchema = new mongoose.Schema({
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'GalleryCategory' },
  categorySlug: { type: String, default: 'campus-life' },
  imageUrl: { type: String, required: true },
  title: { type: String, default: '' },
  caption: { type: String, default: '' },
  description: { type: String, default: '' },
  eventDate: Date,
  eventLocation: String,
  tags: [String],
  featured: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  ...auditColumns
});
gallerySchema.index({ categorySlug: 1, sortOrder: 1 });
const Gallery = mongoose.model('Gallery', gallerySchema);

const uploadSchema = new mongoose.Schema({
  originalName: String,
  mimeType: String,
  size: Number,
  url: String,
  storageProvider: { type: String, enum: ['cloudinary', 's3', 'local', 'external'], default: 'cloudinary' },
  entityType: String,
  entityId: String,
  uploadedBy: String,
  ...auditColumns
});
const Upload = mongoose.model('Upload', uploadSchema);

const activityLogSchema = new mongoose.Schema({
  actor: String,
  action: { type: String, required: true },
  entityType: String,
  entityId: String,
  ip: String,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});
activityLogSchema.index({ action: 1, createdAt: -1 });
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now }
});
const Setting = mongoose.model('Setting', settingSchema);

const programSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  features: [String],
  image: { type: String, default: '' }
});
const Program = mongoose.model('Program', programSchema);

// ======================== MIDDLEWARES ========================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

function adminAuth(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') throw new Error();
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function sanitize(obj) {
  for (let key in obj) {
    if (typeof obj[key] === 'string') obj[key] = xss(obj[key]);
  }
  return obj;
}

const forbiddenPatterns = [/system:/i, /ignore previous/i, /pretend/i, /bypass/i];
function filterPrompt(text) {
  let filtered = text;
  forbiddenPatterns.forEach(p => (filtered = filtered.replace(p, '')));
  return filtered;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'image/x-icon',
      'application/pdf',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'), false);
  }
});

async function uploadToCloudinary(buffer, folder = 'sankalp') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

function slugify(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `item-${Date.now()}`;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  return Boolean(value);
}

function normalizeSubjects(subjects) {
  if (!Array.isArray(subjects)) return [];
  return subjects
    .map(item => ({
      subject: String(item.subject || '').trim(),
      marksObtained: Number(item.marksObtained || item.obtained || 0),
      maxMarks: Number(item.maxMarks || item.total || 100),
      grade: item.grade || '',
      remarks: item.remarks || ''
    }))
    .filter(item => item.subject);
}

function computeResultTotals(subjects) {
  const rows = normalizeSubjects(subjects);
  const totalMarks = rows.reduce((sum, item) => sum + Number(item.marksObtained || 0), 0);
  const maxMarks = rows.reduce((sum, item) => sum + Number(item.maxMarks || 0), 0);
  const percentage = maxMarks ? Number(((totalMarks / maxMarks) * 100).toFixed(2)) : 0;
  return { subjects: rows, totalMarks, maxMarks, percentage };
}

function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function parseCsv(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const splitRow = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };
  const headers = splitRow(lines[0]).map(header => header.trim());
  return lines.slice(1).map(line => {
    const cells = splitRow(line);
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] || '';
      return row;
    }, {});
  });
}

async function writeActivity(req, action, entityType, entityId, metadata = {}) {
  try {
    if (!MONGODB_URI) return;
    await ActivityLog.create({
      actor: req.admin?.email || 'public',
      action,
      entityType,
      entityId: entityId ? String(entityId) : '',
      ip: req.ip,
      metadata
    });
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
}

async function uploadAndTrack(req, file, folder, entityType) {
  if (!file) return '';
  const imageUrl = await uploadToCloudinary(file.buffer, folder);
  await Upload.create({
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url: imageUrl,
    entityType,
    uploadedBy: req.admin?.email || 'system'
  });
  return imageUrl;
}

function buildResultPayload(body, fileUrl = '') {
  const parsedSubjects = parseJsonField(body.subjects, []);
  const totals = computeResultTotals(parsedSubjects);
  const categorySlug = body.categorySlug || body.category || 'class-10-result';
  const resultMode = body.resultMode || body.mode || 'dynamic';
  return {
    categorySlug,
    resultMode,
    registrationNumber: String(body.registrationNumber || '').trim(),
    rollNumber: String(body.rollNumber || '').trim(),
    studentName: String(body.studentName || '').trim(),
    fatherName: String(body.fatherName || '').trim(),
    motherName: String(body.motherName || '').trim(),
    dob: body.dob ? new Date(body.dob) : undefined,
    className: body.className || body.class || '',
    session: body.session || '',
    mobileNumber: body.mobileNumber || '',
    address: body.address || '',
    schoolName: body.schoolName || '',
    photoUrl: body.photoUrl || '',
    fields: parseJsonField(body.fields, {}),
    subjects: totals.subjects,
    totalMarks: Number(body.totalMarks || totals.totalMarks || 0),
    maxMarks: Number(body.maxMarks || totals.maxMarks || 0),
    percentage: Number(body.percentage || totals.percentage || 0),
    grade: body.grade || '',
    rank: body.rank || '',
    remarks: body.remarks || '',
    pdfUrl: fileUrl || body.pdfUrl || '',
    externalUrl: body.externalUrl || '',
    verificationCode: body.verificationCode || `SDP-${Date.now().toString(36).toUpperCase()}`,
    published: parseBoolean(body.published),
    issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
    updatedAt: new Date()
  };
}

// ======================== VALIDATION SCHEMAS ========================

const contactSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  mobile: z.string().regex(/^[0-9+\- ]{7,15}$/),
  subject: z.string().min(2).max(200),
  message: z.string().min(5).max(2000)
});

const resultCheckSchema = z.object({
  categorySlug: z.string().max(100).optional(),
  registrationNumber: z.string().min(1).max(40).optional(),
  rollNumber: z.string().min(1).max(40).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).refine(data => data.registrationNumber || data.rollNumber, {
  message: 'Registration number or roll number is required'
});

const resultCategoryPayloadSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  mode: z.enum(['dynamic', 'pdf', 'link']).default('dynamic'),
  active: z.boolean().optional(),
  sortOrder: z.number().optional(),
  fields: z.array(z.any()).optional(),
  searchFields: z.array(z.string()).optional()
});

const galleryCategoryPayloadSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().optional()
});

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// ======================== UPDATED SYSTEM PROMPT ========================

const SYSTEM_PROMPT = `You are Sankalp Sathi, a friendly and warm AI academic mentor for Sankalp Digital Pathshala, run by Sankalp Shiksha Foundation. Your job is to help students learn. You can answer any academic question, explain concepts, solve problems, and provide study tips. You also know about the foundation, its mission, courses, and admission process. When a user asks an academic question, focus on giving a clear, step‑by‑step explanation. When a user asks about the foundation or admissions, share relevant information.

ABOUT THE FOUNDATION:
Sankalp Shiksha Foundation's mission is "हमारा संकल्प, सामाजिक उत्थान व कायाकल्प" (Our Pledge: Social Upliftment and Transformation). It works to close the digital divide between villages and cities. It was founded on November 18, 2020, and is headquartered in Gorakhpur, Uttar Pradesh. The learning center, Sankalp Digital Pathshala, is in Salemgarh, Tamkuhi, Kushinagar. Founders: Abhishek Kumar (B.Tech from NIT, engineer) and Vikas Kumar (B.Tech CSE from NIT Hamirpur, technical lead). They started the Pathshala to provide digital education, job‑ready skills, and holistic community upliftment. Milestones include starting as COVID‑19 relief in 2020, launching the first digital classroom in 2021, AI & Robotics Labs in 2022, Rojgaar Buddy skilling program in 2023, Doordarshan recognition in 2024, 312+ trainees and 40+ placements in 2025, and expanding to neighboring districts in 2026. The Rojgaar Buddy program trains rural youth in Web Development, Graphic Design, Excel, Digital Marketing, and Communication. Community programs include cleanliness drives, road safety rallies, flood relief, and more.

CONTACT: info@sankalppathshala.com, +91 8055698328. Donate at sankalpshiksha.com/donate.

AI DEVELOPER: This AI assistant was developed by NexGenAiTech, founded by Jahid, specializing in AI and full‑stack development. Website: https://nexgenaitech.online. Contact Jahid at +91 8055698328.

RESPONSE RULES (STRICT):
- Use only plain paragraphs. Do not use markdown, bold, italics, headings, tables, lists, or code blocks.
- Write naturally like you are talking to a friend. Use simple, clear sentences.
- Break information into short paragraphs (2‑4 sentences each). Use a blank line between paragraphs.
- Always answer in the same language the user uses: Hindi, English, or Hinglish.
- When someone asks for admission or course help, gently collect: name, class, interest, phone, city, parent name, email. Then tell them our team will contact them soon.
- If you don't know something, say so honestly and suggest contacting the support team.`;

// ======================== ROUTES ========================

// ---------- PUBLIC SETTINGS / BRANDING ----------
app.get('/api/settings/public', async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json({ branding: DEFAULT_BRANDING });
    const branding = await Setting.findOne({ key: 'branding' });
    res.json({ branding: { ...DEFAULT_BRANDING, ...(branding?.value || {}) } });
  } catch (err) {
    res.json({ branding: DEFAULT_BRANDING });
  }
});

app.get('/api/result/categories', async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json(DEFAULT_RESULT_CATEGORIES);
    const categories = await ResultCategory.find({ active: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
    res.json(categories.length ? categories : DEFAULT_RESULT_CATEGORIES);
  } catch (err) {
    res.json(DEFAULT_RESULT_CATEGORIES);
  }
});

app.get('/api/gallery/categories', async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json(DEFAULT_GALLERY_CATEGORIES);
    const categories = await GalleryCategory.find({ active: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
    res.json(categories.length ? categories : DEFAULT_GALLERY_CATEGORIES);
  } catch (err) {
    res.json(DEFAULT_GALLERY_CATEGORIES);
  }
});

// ---------- AI QUESTION SOLVER (Gemini) ----------
app.post('/api/solve-question', upload.single('file'), async (req, res) => {
  try {
    await connectDB();
    const { type, question } = req.body;
    if (!type || !['text', 'image', 'pdf'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be text, image, or pdf.' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const basePrompt = 'You are a helpful academic tutor. Provide a detailed step-by-step explanation. Answer in the same language as the question.';

    let result;
    if (type === 'text') {
      if (!question) return res.status(400).json({ error: 'Question text required.' });
      const filteredQuestion = filterPrompt(xss(question));
      result = await model.generateContent(`${basePrompt}\n\nQuestion: ${filteredQuestion}`);
    } else if (type === 'image') {
      if (!req.file) return res.status(400).json({ error: 'Image file required.' });
      const imagePart = {
        inlineData: {
          data: req.file.buffer.toString('base64'),
          mimeType: req.file.mimetype
        }
      };
      result = await model.generateContent([basePrompt, imagePart]);
    } else if (type === 'pdf') {
      if (!req.file) return res.status(400).json({ error: 'PDF file required.' });
      const pdfPart = {
        inlineData: {
          data: req.file.buffer.toString('base64'),
          mimeType: 'application/pdf'
        }
      };
      result = await model.generateContent([basePrompt, pdfPart]);
    }

    const response = await result.response;
    const answer = response.text();

    const aiQ = new AIQuestion({
      type,
      question: type === 'text' ? question : `[${type} upload]`,
      answer
    });
    await aiQ.save();

    res.json({ success: true, answer });
  } catch (err) {
    console.error('AI Solver Error:', err);
    res.status(500).json({ error: 'AI processing failed.' });
  }
});

// ---------- STREAMING CHATBOT (OpenRouter with Gemini fallback) ----------
app.post('/api/chat', async (req, res) => {
  try {
    await connectDB();
    let { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });
    message = filterPrompt(xss(message));

    // If no OpenRouter key, fallback to Gemini non-streaming
    if (!OPENROUTER_API_KEY) {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nUser: ${message}`);
      const reply = (await result.response).text();
      // Ensure plain paragraph formatting for Gemini response (may still contain markdown)
      return res.send(reply.replace(/\*\*|__/g, '').replace(/\*/g, '').replace(/#/g, ''));
    }

    // Set streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.sankalpdigitalpathshala.online',
        'X-Title': 'Sankalp Digital Pathshala'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', errorText);
      res.status(500).send('AI service temporarily unavailable.');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const sendChunk = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.replace('data: ', '').trim();
              if (data === '[DONE]') {
                res.end();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  res.write(content);
                }
              } catch (e) { /* ignore malformed chunks */ }
            }
          }
        }
      } catch (err) {
        console.error('Stream error:', err);
        res.end();
      }
    };

    sendChunk();
  } catch (err) {
    console.error('Chatbot Error:', err);
    res.status(500).send('I am having a small technical issue. Please try again.');
  }
});

// ---------- LEAD CAPTURE ----------
app.post('/api/lead', async (req, res) => {
  try {
    await connectDB();
    const schema = z.object({
      firstName: z.string().min(1),
      class: z.string().min(1),
      interest: z.string().min(1),
      phone: z.string().min(7),
      city: z.string().optional(),
      parentName: z.string().optional(),
      email: z.string().email().optional()
    });
    const data = schema.parse(req.body);
    sanitize(data);

    let aiSummary = '';
    let leadScore = 50;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const summaryPrompt = `Based on the following lead info, generate a short summary and a lead score from 0 to 100 (where 100 is highest conversion potential). Return ONLY a JSON object: { "summary": "...", "score": number }. Info: ${JSON.stringify(data)}`;
      const result = await model.generateContent(summaryPrompt);
      const text = (await result.response).text();
      const extracted = JSON.parse(text.match(/\{.*\}/s)[0]);
      aiSummary = extracted.summary || '';
      leadScore = Math.min(100, Math.max(0, Number(extracted.score) || 50));
    } catch (e) { /* use defaults */ }

    const lead = new AILead({ ...data, aiSummary, leadScore });
    await lead.save();
    res.json({ success: true, message: 'Lead captured successfully.' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid lead data.' });
  }
});

// ---------- CONTACT FORM ----------
app.post('/api/contact', async (req, res) => {
  try {
    await connectDB();
    const data = contactSchema.parse(req.body);
    sanitize(data);
    const inquiry = new Inquiry(data);
    await inquiry.save();
    res.json({ success: true, message: 'Thank you for contacting us! We will get back soon.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(500).json({ error: 'Could not submit inquiry.' });
  }
});

// ---------- PUBLIC RESULT CHECKER ----------
const resultLookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: { error: 'Too many result lookups. Please try again after a few minutes.' }
});

app.post('/api/result/check', resultLookupLimiter, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) {
      return res.status(404).json({ error: 'Demo mode is active. Connect a database and publish results to enable verification.' });
    }
    const data = resultCheckSchema.parse(req.body);
    const { registrationNumber, rollNumber, dob, categorySlug } = data;

    const query = { published: true, deletedAt: null };
    if (categorySlug) query.categorySlug = categorySlug;
    if (registrationNumber) query.registrationNumber = registrationNumber;
    if (rollNumber) query.rollNumber = rollNumber;

    const result = await Result.findOne(query).lean();
    if (!result) {
      return res.status(404).json({ error: 'Result not found or not published yet.' });
    }

    const resultDob = new Date(result.dob).toISOString().split('T')[0];
    if (resultDob !== dob) {
      return res.status(400).json({ error: 'Invalid date of birth.' });
    }

    await Result.findByIdAndUpdate(result._id, { lastAccessedAt: new Date(), $inc: { downloadCount: 1 } });
    await writeActivity(req, 'result_viewed', 'result', result._id, {
      categorySlug: result.categorySlug,
      registrationNumber: result.registrationNumber
    });

    res.json({
      success: true,
      result: {
        ...result,
        qrVerificationUrl: `/api/result/verify/${result.verificationCode || result._id}`
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input.', details: err.errors });
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/result/verify/:code', async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(404).json({ error: 'Verification database unavailable.' });
    const result = await Result.findOne({
      verificationCode: req.params.code,
      published: true,
      deletedAt: null
    }).select('studentName registrationNumber rollNumber categorySlug grade percentage issueDate verificationCode');
    if (!result) return res.status(404).json({ error: 'Result verification failed.' });
    res.json({ verified: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ---------- ADMIN AUTH ----------
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

app.get('/api/admin/check-auth', adminAuth, (req, res) => {
  res.json({ authenticated: true, email: req.admin.email });
});

// ---------- ADMIN DASHBOARD ----------
app.get('/api/admin/dashboard', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) {
      return res.json({
        stats: {
          totalChats: 0,
          totalSolves: 0,
          totalLeads: 0,
          totalInquiries: 0,
          totalResults: 0,
          totalCategories: DEFAULT_RESULT_CATEGORIES.length,
          totalStudents: 0,
          totalPdfs: 0,
          totalLinks: 0,
          totalGalleryItems: DEFAULT_GALLERY.length,
          downloads: 0
        },
        charts: { monthlyResults: [], categoryAnalytics: [], downloadsAnalytics: [] }
      });
    }
    const [
      totalChats,
      totalSolves,
      totalLeads,
      totalInquiries,
      totalResults,
      totalCategories,
      totalStudents,
      totalPdfs,
      totalLinks,
      totalGalleryItems
    ] = await Promise.all([
      AIQuestion.countDocuments(),
      AIQuestion.countDocuments(),
      AILead.countDocuments(),
      Inquiry.countDocuments(),
      Result.countDocuments({ deletedAt: null }),
      ResultCategory.countDocuments({ deletedAt: null }),
      Student.countDocuments({ deletedAt: null }),
      Result.countDocuments({ resultMode: 'pdf', deletedAt: null }),
      Result.countDocuments({ resultMode: 'link', deletedAt: null }),
      Gallery.countDocuments({ deletedAt: null })
    ]);

    res.json({
      stats: {
        totalChats,
        totalSolves,
        totalLeads,
        totalInquiries,
        totalResults,
        totalCategories,
        totalStudents,
        totalPdfs,
        totalLinks,
        totalGalleryItems,
        downloads: 0
      },
      charts: {
        monthlyResults: [],
        categoryAnalytics: [],
        downloadsAnalytics: []
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Dashboard error' });
  }
});

// ---------- ADMIN BRANDING / SETTINGS ----------
app.get('/api/admin/settings/branding', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json({ ...DEFAULT_BRANDING, demoMode: true });
    const branding = await Setting.findOne({ key: 'branding' });
    res.json({ ...DEFAULT_BRANDING, ...(branding?.value || {}) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load branding settings.' });
  }
});

app.put('/api/admin/settings/branding', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(503).json({ error: 'Database is required to save settings.' });
    const value = {
      ...DEFAULT_BRANDING,
      logoUrl: req.body.logoUrl || DEFAULT_BRANDING.logoUrl,
      faviconUrl: req.body.faviconUrl || DEFAULT_BRANDING.faviconUrl,
      darkModeLogoUrl: req.body.darkModeLogoUrl || '',
      instituteName: req.body.instituteName || DEFAULT_BRANDING.instituteName,
      primaryColor: req.body.primaryColor || DEFAULT_BRANDING.primaryColor
    };
    const setting = await Setting.findOneAndUpdate(
      { key: 'branding' },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    await writeActivity(req, 'branding_updated', 'settings', 'branding', value);
    res.json(setting.value);
  } catch (err) {
    res.status(500).json({ error: 'Could not save branding settings.' });
  }
});

app.post('/api/admin/settings/branding/upload', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(503).json({ error: 'Database is required to upload branding assets.' });
    if (!req.file) return res.status(400).json({ error: 'File required.' });
    const url = await uploadAndTrack(req, req.file, 'sankalp/branding', 'branding');
    const field = req.body.type === 'favicon' ? 'faviconUrl' : 'logoUrl';
    const current = await Setting.findOne({ key: 'branding' });
    const value = { ...DEFAULT_BRANDING, ...(current?.value || {}), [field]: url };
    await Setting.findOneAndUpdate({ key: 'branding' }, { value, updatedAt: new Date() }, { upsert: true });
    await writeActivity(req, 'branding_asset_uploaded', 'settings', field, { url });
    res.json({ success: true, url, field });
  } catch (err) {
    res.status(500).json({ error: 'Branding upload failed.' });
  }
});

// ---------- RESULT CATEGORY MANAGEMENT ----------
app.get('/api/admin/result-categories', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json(DEFAULT_RESULT_CATEGORIES);
    const categories = await ResultCategory.find({ deletedAt: null }).sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Could not load result categories.' });
  }
});

app.post('/api/admin/result-categories', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(503).json({ error: 'Database is required to create categories.' });
    const data = resultCategoryPayloadSchema.parse(req.body);
    const category = await ResultCategory.create({
      ...data,
      slug: slugify(data.slug || data.name),
      active: data.active !== false
    });
    await writeActivity(req, 'result_category_created', 'result_category', category._id, { name: category.name });
    res.json(category);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    if (err.code === 11000) return res.status(400).json({ error: 'Category slug already exists.' });
    res.status(500).json({ error: 'Could not create category.' });
  }
});

app.put('/api/admin/result-categories/:id', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(503).json({ error: 'Database is required to update categories.' });
    const data = resultCategoryPayloadSchema.partial().parse(req.body);
    if (data.slug || data.name) data.slug = slugify(data.slug || data.name);
    data.updatedAt = new Date();
    const category = await ResultCategory.findByIdAndUpdate(req.params.id, data, { new: true });
    await writeActivity(req, 'result_category_updated', 'result_category', req.params.id, data);
    res.json(category);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Could not update category.' });
  }
});

app.delete('/api/admin/result-categories/:id', adminAuth, async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to delete categories.' });
  await ResultCategory.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), active: false });
  await writeActivity(req, 'result_category_deleted', 'result_category', req.params.id);
  res.json({ success: true });
});

// ---------- STUDENTS ----------
app.get('/api/admin/students', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json([]);
    const students = await Student.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(500);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Could not load students.' });
  }
});

// ---------- ACTIVITY LOGS ----------
app.get('/api/admin/activity-logs', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json([]);
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(150);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Could not load activity logs.' });
  }
});

// ---------- INQUIRIES CRUD ----------
app.get('/api/admin/inquiries', adminAuth, async (req, res) => {
  await connectDB();
  const inquiries = await Inquiry.find().sort({ createdAt: -1 });
  res.json(inquiries);
});

app.patch('/api/admin/inquiries/:id', adminAuth, async (req, res) => {
  await connectDB();
  const { status } = req.body;
  if (!['new', 'contacted', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { status }, { new: true });
  res.json(inquiry);
});

app.delete('/api/admin/inquiries/:id', adminAuth, async (req, res) => {
  await connectDB();
  await Inquiry.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ---------- LEADS CRUD ----------
app.get('/api/admin/leads', adminAuth, async (req, res) => {
  await connectDB();
  const leads = await AILead.find().sort({ createdAt: -1 });
  res.json(leads);
});

app.patch('/api/admin/leads/:id', adminAuth, async (req, res) => {
  await connectDB();
  const { status } = req.body;
  if (!['pending', 'contacted', 'converted'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const lead = await AILead.findByIdAndUpdate(req.params.id, { status }, { new: true });
  res.json(lead);
});

app.delete('/api/admin/leads/:id', adminAuth, async (req, res) => {
  await connectDB();
  await AILead.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ---------- RESULTS CRUD / BULK IMPORT ----------
app.get('/api/admin/results', adminAuth, async (req, res) => {
  const db = await connectDB();
  if (!db) return res.json([]);
  const query = { deletedAt: null };
  if (req.query.categorySlug) query.categorySlug = req.query.categorySlug;
  if (req.query.mode) query.resultMode = req.query.mode;
  const results = await Result.find(query).sort({ createdAt: -1 }).limit(500);
  res.json(results);
});

app.post('/api/admin/results', adminAuth, upload.single('marksheet'), async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to save results.' });
  let fileUrl = '';
  if (req.file) fileUrl = await uploadAndTrack(req, req.file, 'sankalp/results', 'result');
  const payload = buildResultPayload(req.body, fileUrl);
  if (!payload.registrationNumber || !payload.studentName || !payload.dob) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const category = await ResultCategory.findOne({ slug: payload.categorySlug, deletedAt: null });
    if (category) payload.category = category._id;
    const result = new Result(payload);
    await result.save();
    await Student.findOneAndUpdate(
      { registrationNumber: payload.registrationNumber },
      {
        registrationNumber: payload.registrationNumber,
        rollNumber: payload.rollNumber,
        studentName: payload.studentName,
        fatherName: payload.fatherName,
        motherName: payload.motherName,
        dob: payload.dob,
        className: payload.className,
        session: payload.session,
        mobileNumber: payload.mobileNumber,
        address: payload.address,
        schoolName: payload.schoolName,
        photoUrl: payload.photoUrl,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    await writeActivity(req, 'result_created', 'result', result._id, { registrationNumber: result.registrationNumber });
    res.json(result);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Duplicate result key' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/results/:id', adminAuth, upload.single('marksheet'), async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to update results.' });
  try {
    let fileUrl = '';
    if (req.file) fileUrl = await uploadAndTrack(req, req.file, 'sankalp/results', 'result');
    const payload = buildResultPayload(req.body, fileUrl);
    const category = await ResultCategory.findOne({ slug: payload.categorySlug, deletedAt: null });
    if (category) payload.category = category._id;
    const result = await Result.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );
    await writeActivity(req, 'result_updated', 'result', req.params.id, { registrationNumber: payload.registrationNumber });
    res.json(result);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Duplicate result key' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/results/:id', adminAuth, async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to delete results.' });
  await Result.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), published: false });
  await writeActivity(req, 'result_deleted', 'result', req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/results/import', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(503).json({ error: 'Database is required to import results.' });
    if (!req.file) return res.status(400).json({ error: 'CSV file required.' });
    const rows = parseCsv(req.file.buffer);
    const report = { total: rows.length, imported: 0, failed: 0, errors: [] };
    for (const row of rows) {
      try {
        const payload = buildResultPayload({
          ...row,
          categorySlug: row.categorySlug || req.body.categorySlug,
          resultMode: row.resultMode || req.body.resultMode || 'dynamic',
          published: row.published || req.body.published
        });
        if (!payload.registrationNumber || !payload.studentName || !payload.dob) throw new Error('Missing required fields');
        await Result.findOneAndUpdate(
          { categorySlug: payload.categorySlug, registrationNumber: payload.registrationNumber },
          payload,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        report.imported += 1;
      } catch (err) {
        report.failed += 1;
        report.errors.push({ registrationNumber: row.registrationNumber, error: err.message });
      }
    }
    await writeActivity(req, 'results_imported', 'result', '', report);
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: 'Import failed.' });
  }
});

// ---------- EVENTS CRUD ----------
app.get('/api/admin/events', adminAuth, async (req, res) => {
  await connectDB();
  const events = await Event.find().sort({ date: -1 });
  res.json(events);
});

app.post('/api/admin/events', adminAuth, upload.single('image'), async (req, res) => {
  await connectDB();
  let imageUrl = '';
  if (req.file) {
    imageUrl = await uploadToCloudinary(req.file.buffer, 'sankalp/events');
  }
  const { title, description, date } = req.body;
  const event = new Event({ title, description, date, image: imageUrl });
  await event.save();
  res.json(event);
});

app.put('/api/admin/events/:id', adminAuth, upload.single('image'), async (req, res) => {
  await connectDB();
  const update = { ...req.body };
  if (req.file) {
    update.image = await uploadToCloudinary(req.file.buffer, 'sankalp/events');
  }
  const event = await Event.findByIdAndUpdate(req.params.id, update, { new: true });
  res.json(event);
});

app.delete('/api/admin/events/:id', adminAuth, async (req, res) => {
  await connectDB();
  await Event.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ---------- GALLERY CATEGORY / IMAGE MANAGEMENT ----------
app.get('/api/admin/gallery-categories', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json(DEFAULT_GALLERY_CATEGORIES);
    const categories = await GalleryCategory.find({ deletedAt: null }).sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Could not load gallery categories.' });
  }
});

app.post('/api/admin/gallery-categories', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(503).json({ error: 'Database is required to create gallery categories.' });
    const data = galleryCategoryPayloadSchema.parse(req.body);
    const category = await GalleryCategory.create({
      ...data,
      slug: slugify(data.slug || data.name),
      active: data.active !== false
    });
    await writeActivity(req, 'gallery_category_created', 'gallery_category', category._id, { name: category.name });
    res.json(category);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    if (err.code === 11000) return res.status(400).json({ error: 'Gallery category slug already exists.' });
    res.status(500).json({ error: 'Could not create gallery category.' });
  }
});

app.put('/api/admin/gallery-categories/:id', adminAuth, async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.status(503).json({ error: 'Database is required to update gallery categories.' });
    const data = galleryCategoryPayloadSchema.partial().parse(req.body);
    if (data.slug || data.name) data.slug = slugify(data.slug || data.name);
    data.updatedAt = new Date();
    const category = await GalleryCategory.findByIdAndUpdate(req.params.id, data, { new: true });
    await writeActivity(req, 'gallery_category_updated', 'gallery_category', req.params.id, data);
    res.json(category);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Could not update gallery category.' });
  }
});

app.delete('/api/admin/gallery-categories/:id', adminAuth, async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to delete gallery categories.' });
  await GalleryCategory.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), active: false });
  await writeActivity(req, 'gallery_category_deleted', 'gallery_category', req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/gallery', adminAuth, async (req, res) => {
  const db = await connectDB();
  if (!db) return res.json(DEFAULT_GALLERY);
  const query = { deletedAt: null };
  if (req.query.categorySlug) query.categorySlug = req.query.categorySlug;
  const items = await Gallery.find(query).sort({ sortOrder: 1, createdAt: -1 });
  res.json(items);
});

app.post('/api/admin/gallery', adminAuth, upload.single('image'), async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to upload gallery images.' });
  if (!req.file) return res.status(400).json({ error: 'Image required' });
  const imageUrl = await uploadAndTrack(req, req.file, 'sankalp/gallery', 'gallery');
  const tags = parseJsonField(req.body.tags, String(req.body.tags || '').split(',').map(tag => tag.trim()).filter(Boolean));
  const gallery = new Gallery({
    categorySlug: req.body.categorySlug || 'campus-life',
    imageUrl,
    title: req.body.title || req.body.caption || '',
    caption: req.body.caption || '',
    description: req.body.description || '',
    eventDate: req.body.eventDate ? new Date(req.body.eventDate) : undefined,
    eventLocation: req.body.eventLocation || '',
    tags,
    featured: parseBoolean(req.body.featured),
    sortOrder: Number(req.body.sortOrder || 0)
  });
  await gallery.save();
  await writeActivity(req, 'gallery_image_uploaded', 'gallery', gallery._id, { title: gallery.title });
  res.json(gallery);
});

app.put('/api/admin/gallery/:id', adminAuth, upload.single('image'), async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to update gallery images.' });
  const update = {
    categorySlug: req.body.categorySlug || 'campus-life',
    title: req.body.title || '',
    caption: req.body.caption || '',
    description: req.body.description || '',
    eventDate: req.body.eventDate ? new Date(req.body.eventDate) : undefined,
    eventLocation: req.body.eventLocation || '',
    tags: parseJsonField(req.body.tags, String(req.body.tags || '').split(',').map(tag => tag.trim()).filter(Boolean)),
    featured: parseBoolean(req.body.featured),
    sortOrder: Number(req.body.sortOrder || 0),
    updatedAt: new Date()
  };
  if (req.file) update.imageUrl = await uploadAndTrack(req, req.file, 'sankalp/gallery', 'gallery');
  const gallery = await Gallery.findByIdAndUpdate(req.params.id, update, { new: true });
  await writeActivity(req, 'gallery_image_updated', 'gallery', req.params.id, update);
  res.json(gallery);
});

app.delete('/api/admin/gallery/:id', adminAuth, async (req, res) => {
  const db = await connectDB();
  if (!db) return res.status(503).json({ error: 'Database is required to delete gallery images.' });
  await Gallery.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
  await writeActivity(req, 'gallery_image_deleted', 'gallery', req.params.id);
  res.json({ success: true });
});

// ---------- PROGRAMS CRUD ----------
app.get('/api/admin/programs', adminAuth, async (req, res) => {
  await connectDB();
  const programs = await Program.find().sort({ title: 1 });
  res.json(programs);
});

app.post('/api/admin/programs', adminAuth, async (req, res) => {
  await connectDB();
  const program = new Program(req.body);
  await program.save();
  res.json(program);
});

app.put('/api/admin/programs/:id', adminAuth, async (req, res) => {
  await connectDB();
  const program = await Program.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(program);
});

app.delete('/api/admin/programs/:id', adminAuth, async (req, res) => {
  await connectDB();
  await Program.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ---------- PUBLIC DATA ----------
app.get('/api/public/events', async (req, res) => {
  await connectDB();
  const events = await Event.find().sort({ date: 1 });
  res.json(events);
});

app.get('/api/public/gallery', async (req, res) => {
  try {
    const db = await connectDB();
    if (!db) return res.json(DEFAULT_GALLERY);
    const query = { deletedAt: null };
    if (req.query.categorySlug && req.query.categorySlug !== 'all') query.categorySlug = req.query.categorySlug;
    const gallery = await Gallery.find(query).sort({ featured: -1, sortOrder: 1, createdAt: -1 });
    res.json(gallery.length ? gallery : DEFAULT_GALLERY);
  } catch (err) {
    res.json(DEFAULT_GALLERY);
  }
});

app.get('/api/public/programs', async (req, res) => {
  await connectDB();
  const programs = await Program.find();
  res.json(programs);
});

// ---------- FALLBACK ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === 'Invalid file type') return res.status(400).json({ error: 'Invalid file type' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- START ----------
if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}

module.exports = app;
