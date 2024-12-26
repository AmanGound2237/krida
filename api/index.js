const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer'); // For file uploads
const rateLimit = require('express-rate-limit');
const serverless = require('serverless-http');

// Initialize Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' })); // Parse JSON with size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded data

// Rate Limiting Middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
});
app.use('/api/login', limiter);
app.use('/api/register', limiter);

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/kridart';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

// Models
const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    password: String,
}));
const Project = mongoose.model('Project', new mongoose.Schema({
    name: String,
    data: Object,
    owner: String,
    createdAt: { type: Date, default: Date.now },
}));
const Asset = mongoose.model('Asset', new mongoose.Schema({
    name: String,
    path: String,
    uploadedAt: { type: Date, default: Date.now },
}));

// JWT Secret
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';

// File Upload Configuration (Use external storage like S3 in production)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Routes

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'User registered' });
    } catch (err) {
        res.status(500).json({ message: 'Registration failed', error: err.message });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
});

// Create Project
app.post('/api/projects', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ message: 'No token provided' });

        const decoded = jwt.verify(token, SECRET_KEY);
        const { name, data } = req.body;
        const project = new Project({ name, data, owner: decoded.id });
        await project.save();
        res.status(201).json({ message: 'Project created', project });
    } catch (err) {
        res.status(500).json({ message: 'Error creating project', error: err.message });
    }
});

// Fetch Projects
app.get('/api/projects', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ message: 'No token provided' });

        const decoded = jwt.verify(token, SECRET_KEY);
        const projects = await Project.find({ owner: decoded.id });
        res.json(projects);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching projects', error: err.message });
    }
});

// Upload Asset
app.post('/api/assets', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const asset = new Asset({ name: req.file.originalname, path: req.file.path });
        await asset.save();
        res.status(201).json({ message: 'Asset uploaded', asset });
    } catch (err) {
        res.status(500).json({ message: 'Asset upload failed', error: err.message });
    }
});

// Physics Engine Example (Optional Feature)
app.get('/api/physics-simulate', (req, res) => {
    res.json({ message: 'Physics simulation not implemented' });
});

// Default route for API health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ message: 'API is healthy' });
});

// Export for Vercel
module.exports = serverless(app);
