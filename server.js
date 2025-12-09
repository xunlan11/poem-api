// 服务器
const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const morgan = require('morgan');
const Fuse = require('fuse.js');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pinyin } = require('pinyin-pro');
const multer = require('multer');
const XLSX = require('xlsx');
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.POEM_JWT_SECRET || 'poem-secret-please-change';
const COOKIE_NAME = 'poem_token';
const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax' };
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
app.use(cookieParser());
app.use(authFromCookie);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'nodes.json');
const USER_FILE = path.join(DATA_DIR, 'users.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.ensureDirSync(UPLOAD_DIR);

// 清理节点ID的函数
function sanitizeNodeId(rawId) {
  if (!rawId) return '';
  const cleaned = String(rawId).trim().toUpperCase();
  const safe = cleaned.replace(/[^A-Z0-9]/g, '');
  return safe;
}

// 获取文件扩展名的安全函数
function safeExtname(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (!ext) return '.png';
  return /^\.[a-z0-9]+$/i.test(ext) ? ext : '.png';
}

// 从图片路径中提取上传文件名
function extractUploadFilename(imagePath = '') {
  if (!imagePath || typeof imagePath !== 'string') return '';
  const match = imagePath.match(/\/uploads\/([^/?#]+)/i);
  if (match && match[1]) return match[1];
  return path.basename(imagePath);
}

// 确保节点图片文件名正确
async function ensureNodeImageFilename(node) {
  if (!node || !node.extra || !node.extra.image) return;
  const nodeId = sanitizeNodeId(node.id);
  if (!nodeId) return;
  const filename = extractUploadFilename(node.extra.image);
  if (!filename) return;
  const currentPath = path.join(UPLOAD_DIR, filename);
  if (!(await fs.pathExists(currentPath))) return;
  const desiredExt = safeExtname(filename);
  const desiredName = `node_${nodeId}${desiredExt}`;
  if (desiredName === filename) return;
  const targetPath = path.join(UPLOAD_DIR, desiredName);
  await fs.move(currentPath, targetPath, { overwrite: true });
  node.extra.image = `/uploads/${desiredName}`;
}

// 根据节点ID删除节点图片
async function deleteNodeImageByPath(nodeId, imagePath) {
  const cleanId = sanitizeNodeId(nodeId);
  if (!cleanId) return;
  const filename = extractUploadFilename(imagePath);
  if (!filename) return;
  const prefix = `node_${cleanId}`.toLowerCase();
  if (!filename.toLowerCase().startsWith(prefix)) return;
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  } catch (err) {
    console.error('Failed to remove node image', filePath, err);
  }
}

// Multer上传
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = safeExtname(file.originalname || '');
    const nodeId = sanitizeNodeId(req.body?.nodeId || req.query?.nodeId || req.params?.id);
    const stamp = Date.now();
    const base = nodeId ? `node_${nodeId}` : `node_${stamp}`;
    cb(null, `${base}${ext}`);
  }
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('仅支持图片上传'), ok);
  }
});

// 节点类型定义
const TYPES = ['W', 'G', 'C', 'E', 'S', 'L'];

// 默认存储结构
const defaultStore = () => ({
  W: { lastId: 0, items: {} },
  G: { lastId: 0, items: {} },
  C: { lastId: 0, items: {} },
  E: { lastId: 0, items: {} },
  S: { lastId: 0, items: {} },
  L: { lastId: 0, items: {} }
});

// 全局数据存储
let store = defaultStore();
let users = [];
let externalItems = [];

// 加载外部列表（从Excel文件）
async function loadExternalList() {
  try {
    const filePath = path.join(__dirname, '构建总表.xlsx');
    if (await fs.pathExists(filePath)) {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      externalItems = rows.map(row => {
        const val = row && row[0];
        return val ? String(val).trim() : '';
      }).filter(Boolean);
      console.log(`Loaded ${externalItems.length} items from external list.`);
    }
  } catch (err) {
    console.error('Failed to load external list', err);
  }
}

// 加载数据存储
async function loadStore() {
  await loadExternalList();
  await fs.ensureDir(DATA_DIR);
  if (!(await fs.pathExists(DATA_FILE))) {
    await fs.writeJson(DATA_FILE, defaultStore(), { spaces: 2 });
  }
  store = await fs.readJson(DATA_FILE);
  TYPES.forEach(type => {
    if (!store[type]) store[type] = { lastId: 0, items: {} };
  });
  if (!(await fs.pathExists(USER_FILE))) {
    const now = new Date().toISOString();
    const admin = {
      id: 'u_1', username: 'admin', password_hash: bcrypt.hashSync('admin123', 10), role: 'admin',
      real_name: '管理员', student_id: '', created_at: now, profile_completed: false
    };
    await fs.writeJson(USER_FILE, [admin], { spaces: 2 });
  }
  users = await fs.readJson(USER_FILE);
}

// 保存数据存储到文件
async function saveStore() {
  await fs.writeJson(DATA_FILE, store, { spaces: 2 });
}

// 保存用户数据到文件
async function saveUsers() {
  await fs.writeJson(USER_FILE, users, { spaces: 2 });
}

// 数字补齐5位字符串
function pad5(n) {
  return String(n).padStart(5, '0');
}

// 从ID中提取数字部分
function idNumber(id) {
  if (!id || id.length < 2) return 0;
  const num = parseInt(id.slice(1), 10);
  return isNaN(num) ? 0 : num;
}

// 生成下一个ID
function nextId(type) {
  if (!TYPES.includes(type)) throw new Error('Invalid type');
  const used = new Set(Object.keys(store[type].items || {}).map(k => idNumber(k)));
  let i = 1;
  while (used.has(i)) i++;
  store[type].lastId = Math.max(store[type].lastId || 0, i);
  return `${type}${pad5(i)}`;
}

// 根据ID查找节点
function findById(id) {
  if (!id) return null;
  const type = id[0];
  if (TYPES.includes(type)) {
    return store[type].items[id] || null;
  }
  for (const t of TYPES) {
    if (store[t].items[id]) return store[t].items[id];
  }
  return null;
}

// 简化节点数据用于显示
function simplify(node) {
  const fields = node.fields || {};
  let displayName = '';
  if (node.type === 'C') {
    displayName = fields.common || node.name || node.title || node.person?.name || (node.explanation?.slice(0, 16) || '');
  } else if (node.type === 'E') {
    displayName = fields.statement || node.name || node.title || (node.explanation?.slice(0, 16) || '');
  } else if (node.type === 'S') {
    displayName = fields.commonName || fields.statement || node.name || node.title || node.extra?.introduction || (node.explanation?.slice(0, 16) || '');
  } else if (node.type === 'L') {
    const subKey = fields.sub || node.fields?.sub || node.extra?.sub;
    if (subKey === 'yunbu') {
      displayName = fields.title || fields.rhymeGroup || node.name || node.title || '';
    } else if (subKey === 'ciqupu') {
      displayName = fields.title || node.name || node.title || '';
    } else {
      displayName = node.name || fields.title || node.title || '';
    }
  } else {
    displayName = node.name || node.title || node.person?.name || node.explanation?.slice(0, 16) || '';
  }
  const rawReviewer = node.meta?.reviewedBy || node.meta?.reviewedByName || '';
  const rawCreator = node.meta?.createdBy || node.meta?.createdByName || '';
  let reviewerEntry = '';
  try {
    const evals = node.extra && Array.isArray(node.extra.evaluation) ? node.extra.evaluation : [];
    const parts = evals.map(e => {
      if (!e) return '';
      return String(e.content || e.内容 || e.review_comment || e.comment || e.备注 || '').trim();
    }).filter(Boolean);
    if (parts.length) reviewerEntry = parts.join(' / ');
  } catch (e) { }
  const reviewStatusVal = node.extra?.reviewStatus || '';
  const repairStatusVal = node.extra?.repairStatus || '';
  const expectedDurationVal = node.extra?.expectedDuration || '';
  const reviewDurationVal = node.extra?.reviewDuration || '';
  const statusMap = { pending: '未审核', rejected: '未通过', approved: '通过', archived: '归档' };
  const repairMap = { unfinished: '未完成', finished: '完成' };
  const otherStmtList = Array.isArray(fields.otherStatements) ? fields.otherStatements.join(' ') : (fields.otherStatements || '');
  const otherStmt = fields.otherStatement || otherStmtList || fields.statement || '';
  return {
    id: node.id,
    type: node.type,
    name: displayName,
    creator: rawCreator || '',
    createdAt: node.meta?.createdAt || '',
    reviewer: rawReviewer || '',
    reviewDuration: reviewDurationVal,
    expectedDuration: expectedDurationVal,
    reviewStatus: reviewStatusVal,
    reviewStatusLabel: statusMap[reviewStatusVal] || '',
    repairStatus: repairStatusVal,
    repairStatusLabel: repairMap[repairStatusVal] || '',
    reviewerEntry: reviewerEntry,
    otherStatement: otherStmt,
  };
}

// 获取所有项目（可选按类型过滤）
function allItems(type) {
  if (type && TYPES.includes(type)) {
    return Object.values(store[type].items);
  }
  return TYPES.flatMap(t => Object.values(store[t].items));
}

// 构建搜索令牌（包括拼音）
function buildSearchTokens(text) {
  if (!text) return [];
  const str = String(text);
  const trimmed = str.trim().toLowerCase();
  if (!trimmed) return [str];
  const tokens = new Set([str, trimmed]);
  try {
    const full = pinyin(str, { toneType: 'none', v: true, nonZh: 'consecutive', type: 'array' }) || [];
    if (Array.isArray(full) && full.length) {
      const joined = full.join('');
      const spaced = full.join(' ');
      if (joined) tokens.add(joined.toLowerCase());
      if (spaced) tokens.add(spaced.toLowerCase());
      if (full.every(s => s && s.length)) {
        tokens.add(full.map(s => s[0]).join('').toLowerCase());
      }
    }
  } catch (e) { }
  return Array.from(tokens);
}

// 模糊搜索项目
function fuzzySearch(items, q) {
  if (!q || !q.trim()) return items;
  const searchKeys = [
    { name: 'id', weight: 0.5 },
    { name: 'name', weight: 0.7 },
    { name: 'meta.createdBy', weight: 0.4 },
    { name: 'fields.common', weight: 0.8 },
    { name: 'fields.commonName', weight: 0.9 },
    { name: 'fields.statement', weight: 0.8 },
    { name: 'fields.otherStatement', weight: 0.8 },
    { name: 'fields.otherStatements', weight: 0.8 },
    { name: 'fields.otherNames', weight: 0.7 },
    { name: 'fields.scientificName', weight: 0.6 },
    { name: 'extra.explanation', weight: 0.6 },
    { name: 'extra.introduction', weight: 0.6 },
    { name: 'fields.title', weight: 0.6 },
    { name: 'fields.name', weight: 0.6 },
  ];
  const enriched = items.map(item => {
    const enrichedItem = { ...item, __searchTokens: [] };
    searchKeys.forEach(key => {
      if (!key.name) return;
      const parts = key.name.split('.');
      let value = enrichedItem;
      for (const part of parts) {
        if (value && Object.prototype.hasOwnProperty.call(value, part)) {
          value = value[part];
        } else {
          value = null;
          break;
        }
      }
      if (value === null || value === undefined) return;
      if (Array.isArray(value)) {
        value.forEach(v => buildSearchTokens(v).forEach(token => enrichedItem.__searchTokens.push(token)));
      } else {
        buildSearchTokens(value).forEach(token => enrichedItem.__searchTokens.push(token));
      }
    });
    return enrichedItem;
  });
  const fuse = new Fuse(enriched, {
    keys: [
      { name: 'id', weight: 0.4 },
      { name: 'name', weight: 0.6 },
      { name: 'meta.createdBy', weight: 0.3 },
      { name: '__searchTokens', weight: 0.8 },
    ],
    threshold: 0.45,
    ignoreLocation: true,
    distance: 200,
    minMatchCharLength: 1,
  });
  return fuse.search(q).map(r => r.item);
}

// 健康检查路由
app.get('/health', (req, res) => {
  res.type('text/plain').send('healthy');
});

// 获取统计信息路由
app.get('/api/stats', (req, res) => {
  const stats = { total: 0, by_type: {} };
  for (const t of TYPES) {
    const count = Object.keys(store[t].items).length;
    stats.by_type[t] = count;
    stats.total += count;
  }
  res.json(stats);
});

// 获取节点列表路由
app.get('/api/nodes', (req, res) => {
  const { type, search, limit = '50', offset = '0' } = req.query;
  const filterType = String(req.query.filterType || req.query.ft || '').trim().toUpperCase();
  const reviewStatus = String(req.query.reviewStatus || req.query.rs || '').trim().toLowerCase();
  const repairStatus = String(req.query.repairStatus || req.query.rr || '').trim().toLowerCase();
  const startRaw = String(req.query.startDate || req.query.start || req.query.ds || '').trim();
  const endRaw = String(req.query.endDate || req.query.end || req.query.de || '').trim();
  const parseDate = (value) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  };
  const startTs = parseDate(startRaw);
  const endTs = parseDate(endRaw);
  const endInclusive = typeof endTs === 'number' ? endTs + 86400000 - 1 : null;
  const baseItems = allItems(type);
  let filtered = baseItems;
  if (filterType && TYPES.includes(filterType)) {
    filtered = filtered.filter(item => item?.type === filterType);
  }
  if (startTs || endInclusive) {
    filtered = filtered.filter(item => {
      const createdValue = item?.meta?.createdAt || '';
      const createdTs = Date.parse(createdValue);
      if (Number.isNaN(createdTs)) return false;
      if (startTs && createdTs < startTs) return false;
      if (endInclusive && createdTs > endInclusive) return false;
      return true;
    });
  }
  const filterUnarchived = reviewStatus === 'unarchived';
  const allowedStatuses = new Set(['pending', 'rejected', 'approved', 'archived', 'final']);
  const normalizedReview = allowedStatuses.has(reviewStatus) ? reviewStatus : '';
  if (filterUnarchived) {
    filtered = filtered.filter(item => (item?.extra?.reviewStatus || '') !== 'archived');
  } else if (normalizedReview) {
    filtered = filtered.filter(item => (item?.extra?.reviewStatus || '') === normalizedReview);
  }
  const allowedRepair = new Set(['unfinished', 'finished']);
  const normalizedRepair = normalizedReview === 'rejected' && allowedRepair.has(repairStatus) ? repairStatus : '';
  if (normalizedRepair) {
    filtered = filtered.filter(item => (item?.extra?.repairStatus || '') === normalizedRepair);
  }
  const searched = fuzzySearch(filtered, search);
  const off = Math.max(parseInt(offset) || 0, 0);
  const lim = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
  const hasSearch = typeof search === 'string' && search.trim();
  let ordered = searched;
  if (!hasSearch) {
    ordered = searched.slice().sort((a, b) => {
      const da = a?.meta?.createdAt ? Date.parse(a.meta.createdAt) : NaN;
      const db = b?.meta?.createdAt ? Date.parse(b.meta.createdAt) : NaN;
      const va = Number.isNaN(da) ? 0 : da;
      const vb = Number.isNaN(db) ? 0 : db;
      if (vb !== va) return vb - va;
      return idNumber(b.id) - idNumber(a.id);
    });
  }
  const page = ordered.slice(off, off + lim).map(simplify);
  res.json({ data: page, pagination: { total: ordered.length, limit: lim, offset: off } });
});

// 获取单个节点路由
app.get('/api/node/:id', (req, res) => {
  const node = findById(req.params.id);
  if (!node) return res.status(404).json({ error: 'Not found' });
  res.json(node);
});

// 创建节点路由
app.post('/api/node', requireAuth, requireProfile, async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const id = nextId(type);
    const now = new Date().toISOString().slice(0, 10);
    const node = {
      id,
      type,
      name: data?.name || '',
      meta: {
        createdById: req.user.id,
        createdByName: formatUserDisplayName(req.user),
        createdBy: formatUserDisplayName(req.user),
        createdAt: now,
        reviewedById: '',
        reviewedByName: '',
        reviewedBy: '',
        reviewedAt: '',
        updatedAt: now,
      },
      content: data?.content || '',
      annotations: Array.isArray(data?.annotations) ? data.annotations : [],
      links: Array.isArray(data?.links) ? data.links : [],
      fields: data?.fields || {},
      extra: data?.extra || {},
    };
    await ensureNodeImageFilename(node);
    store[type].items[id] = node;
    await saveStore();
    res.status(201).json(node);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create node' });
  }
});

// 更新节点路由
app.put('/api/node/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const existing = findById(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const type = existing.type;
    const data = req.body || {};
    const requestedReviewStatus = typeof data.extra?.reviewStatus === 'string' ? data.extra.reviewStatus.trim() : '';
    const normalizedReviewStatus = requestedReviewStatus || 'pending';
    const allowedReviewStatuses = new Set(['pending', 'approved', 'rejected', 'archived', 'final']);
    const safeReviewStatus = allowedReviewStatuses.has(normalizedReviewStatus) ? normalizedReviewStatus : 'pending';
    const previousImagePath = existing.extra?.image || '';
    const isOwnerId = existing.meta?.createdById && existing.meta.createdById === req.user.id;
    const isOwnerName = existing.meta?.createdBy && (existing.meta.createdBy === (req.user.real_name || req.user.username));
    const isOwner = !!(isOwnerId || isOwnerName);
    const canEditAll = req.user.role === 'reviewer' || req.user.role === 'admin';
    const wantsOverwriteReview = data._overwriteReview === true;
    const hasExistingReview = !!(existing.meta?.reviewedBy || existing.meta?.reviewedAt);
    const canStampReview = canEditAll && !isOwner && safeReviewStatus !== 'pending' && (!hasExistingReview || wantsOverwriteReview);
    if (!isOwner && !canEditAll) return res.status(403).json({ error: 'Forbidden' });
    existing.name = data.name ?? existing.name;
    existing.content = data.content ?? existing.content;
    existing.annotations = Array.isArray(data.annotations) ? data.annotations : existing.annotations;
    existing.links = Array.isArray(data.links) ? data.links : existing.links;
    existing.fields = data.fields ?? existing.fields;
    existing.extra = data.extra ?? existing.extra ?? {};
    if (!existing.extra.reviewStatus) existing.extra.reviewStatus = safeReviewStatus;
    const canOverrideCreatedAt = req.user.role === 'admin';
    const requestedCreatedAt = typeof data.meta?.createdAt === 'string' ? data.meta.createdAt.trim() : '';
    const normalizedCreatedAt = (canOverrideCreatedAt && requestedCreatedAt && /^\d{4}-\d{2}-\d{2}$/.test(requestedCreatedAt))
      ? requestedCreatedAt
      : (existing.meta?.createdAt || new Date().toISOString().slice(0, 10));
    existing.meta = {
      ...existing.meta,
      createdById: existing.meta?.createdById || '',
      createdByName: existing.meta?.createdByName || '',
      createdBy: existing.meta?.createdBy || '',
      createdAt: normalizedCreatedAt,
      reviewedById: canStampReview ? req.user.id : existing.meta?.reviewedById || '',
      reviewedByName: canStampReview ? formatUserDisplayName(req.user) : existing.meta?.reviewedByName || '',
      reviewedBy: canStampReview ? formatUserDisplayName(req.user) : existing.meta?.reviewedBy || '',
      reviewedAt: canStampReview ? new Date().toISOString().slice(0, 10) : existing.meta?.reviewedAt || '',
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    await ensureNodeImageFilename(existing);
    store[type].items[id] = existing;
    await saveStore();
    const newImagePath = existing.extra?.image || '';
    if (previousImagePath && previousImagePath !== newImagePath) {
      await deleteNodeImageByPath(id, previousImagePath);
    }
    res.json(existing);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

app.post('/api/upload/image', requireAuth, requireProfile, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing file' });
    let filename = req.file.filename;
    let filePath = req.file.path || path.join(UPLOAD_DIR, filename);
    const nodeId = sanitizeNodeId(req.body?.nodeId);
    if (nodeId) {
      const desiredName = `node_${nodeId}${safeExtname(req.file.originalname || filename)}`;
      if (desiredName !== filename) {
        const targetPath = path.join(UPLOAD_DIR, desiredName);
        await fs.move(filePath, targetPath, { overwrite: true });
        filename = desiredName;
        filePath = targetPath;
      }
    }
    res.json({ ok: true, path: `/uploads/${filename}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// 上传图片路由
app.post('/api/upload/image', requireAuth, requireProfile, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing file' });
    let filename = req.file.filename;
    let filePath = req.file.path || path.join(UPLOAD_DIR, filename);
    const nodeId = sanitizeNodeId(req.body?.nodeId);
    if (nodeId) {
      const desiredName = `node_${nodeId}${safeExtname(req.file.originalname || filename)}`;
      if (desiredName !== filename) {
        const targetPath = path.join(UPLOAD_DIR, desiredName);
        await fs.move(filePath, targetPath, { overwrite: true });
        filename = desiredName;
        filePath = targetPath;
      }
    }
    res.json({ ok: true, path: `/uploads/${filename}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// 搜索路由
app.get('/api/search', (req, res) => {
  const { q, type } = req.query;
  const items = allItems(type);
  const results = fuzzySearch(items, q).map(simplify).slice(0, 50);
  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    const externalMatches = externalItems.filter(item => item.toLowerCase().includes(query));
    const limitedExternal = externalMatches.slice(0, 10).map(name => ({
      id: '总表',
      type: 'EXTERNAL',
      name: name,
      creator: '系统导入',
      createdAt: '',
      isExternal: true
    }));
    results.push(...limitedExternal);
  }
  res.json({ query: q || '', results });
});

// Logo文件路由
app.get('/assets/logo.png', async (req, res) => {
  try {
    const logoPath = path.join(__dirname, 'public', 'assets', 'logo.png');
    if (await fs.pathExists(logoPath)) {
      return res.sendFile(logoPath);
    }
    return res.status(404).end();
  } catch (e) { console.error('logo serve failed', e); return res.status(500).end(); }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 根路径重定向到index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 初始化存储并启动服务器
loadStore().then(() => {
  app.listen(PORT, () => {
    console.log(`Poem API running at http://localhost:${PORT}/`);
  });
}).catch(err => {
  console.error('Failed to load data store', err);
  process.exit(1);
});

function findUserByUsername(username) {
  return users.find(u => u.username === username);
}

function findUserById(id) {
  return users.find(u => u.id === id);
}

// 生成JWT令牌
function issueToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// 从Cookie中认证用户
function authFromCookie(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findUserById(payload.uid);
    if (user) {
      req.user = { id: user.id, username: user.username, role: user.role, real_name: user.real_name, student_id: user.student_id, profile_completed: !!user.profile_completed };
    }
  } catch (e) {
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireProfile(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role === 'admin') return next();  // 初始管理员账号跳过真实姓名和学号要求
  if (!req.user.real_name || !req.user.student_id) return res.status(400).json({ error: 'Profile incomplete' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function requireReviewerOrAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role === 'reviewer' || req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// 格式化用户显示名称
function formatUserDisplayName(user) {
  if (user.real_name && user.student_id) {
    return `${user.real_name}(${user.student_id})`;
  }
  return user.username;
}

// 登录路由
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  let u = findUserByUsername(username);
  if (!u) {
    // 首次登录注册为整理员
    const now = new Date().toISOString();
    u = { id: nextUserId(), username, password_hash: bcrypt.hashSync(password, 10), role: 'user', real_name: '', student_id: '', created_at: now, profile_completed: false };
    users.push(u);
    await saveUsers();
  } else {
    const ok = bcrypt.compareSync(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
    await saveUsers();
  }
  const token = issueToken(u);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ id: u.id, username: u.username, role: u.role, real_name: u.real_name, student_id: u.student_id, profile_completed: !!u.profile_completed });
});

// 登出路由
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  res.json({ ok: true });
});

// 获取当前用户信息路由
app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(200).json(null);
  res.json(req.user);
});

// 更新用户资料路由
app.post('/api/auth/profile', requireAuth, async (req, res) => {
  const { real_name, student_id } = req.body || {};
  const u = findUserById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!real_name || !student_id) return res.status(400).json({ error: 'Missing fields' });
  u.real_name = String(real_name);
  u.student_id = String(student_id);
  u.profile_completed = true;
  await saveUsers();
  res.json({ ok: true });
});

// 获取用户列表路由（管理员）
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  res.json(users.map(u => ({ id: u.id, username: u.username, role: u.role, real_name: u.real_name, student_id: u.student_id, created_at: u.created_at, profile_completed: !!u.profile_completed })));
});

// 生成下一个用户ID
function nextUserId() {
  const used = new Set(users.map(u => {
    const n = parseInt(String(u.id).split('_')[1] || '0', 10);
    return isNaN(n) ? 0 : n;
  }));
  for (let i = 1; ; i++) {
    if (!used.has(i)) return `u_${i}`;
  }
}

// 创建用户路由（管理员）
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role = 'user' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  if (!['user', 'reviewer', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (findUserByUsername(username)) return res.status(409).json({ error: 'Username exists' });
  const now = new Date().toISOString();
  const u = { id: nextUserId(), username, password_hash: bcrypt.hashSync(password, 10), role, real_name: '', student_id: '', created_at: now, profile_completed: false };
  users.push(u);
  await saveUsers();
  res.status(201).json({ id: u.id, username: u.username, role: u.role });
});

// 删除用户路由（管理员）
app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const u = findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  // 不允许删除超级管理员和自己
  if (u.id === 'u_1') {
    return res.status(403).json({ error: 'Cannot delete super admin' });
  }
  if (u.id === req.user.id) {
    return res.status(403).json({ error: 'Cannot delete yourself' });
  }
  users = users.filter(x => x.id !== u.id);
  await saveUsers();
  res.json({ ok: true });
});

// 删除节点路由（审阅者或管理员）
app.delete('/api/nodes/:id', requireAuth, requireReviewerOrAdmin, async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  const type = id[0];
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Invalid id' });
  const existing = store[type].items[id];
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await deleteNodeImageByPath(id, existing.extra?.image);
  delete store[type].items[id];
  await saveStore();
  res.json({ ok: true });
});

// 批量归档节点路由（管理员）
app.post('/api/nodes/archive', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Missing ids' });
    }
    const updatedNodes = [];
    for (const id of ids) {
      const node = findById(id);
      if (!node) continue;
      if (!node.extra) node.extra = {};
      node.extra.reviewStatus = 'archived';
      updatedNodes.push(node);
    }
    if (!updatedNodes.length) {
      return res.status(404).json({ error: 'No nodes updated' });
    }
    await saveStore();
    res.json({ ok: true, updated: updatedNodes.map(simplify) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to archive nodes' });
  }
});