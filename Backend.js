const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Server } = require('socket.io');
const http = require('http');
const Ammo = require('ammo.js');
const multer = require('multer'); // For asset uploads
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// Rate Limiting Middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/login', limiter); // Apply to login
app.use('/api/register', limiter); // Apply to register

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/kridart', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Models
const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
});
const ProjectSchema = new mongoose.Schema({
    name: String,
    data: Object,
    owner: String,
    createdAt: { type: Date, default: Date.now },
});
const AssetSchema = new mongoose.Schema({
    name: String,
    path: String,
    uploadedAt: { type: Date, default: Date.now },
});
const MessageSchema = new mongoose.Schema({
    username: String,
    message: String,
    createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);
const Project = mongoose.model('Project', ProjectSchema);
const Asset = mongoose.model('Asset', AssetSchema);
const Message = mongoose.model('Message', MessageSchema);

// JWT Secret
const SECRET_KEY = 'your_secret_key';

// File Upload Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
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
        const { name, data } = req.body;
        
        if (!name || !data) {
            return res.status(400).json({ message: 'Name and data are required' });
        }

        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ message: 'No token provided' });

        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            const project = new Project({ name, data, owner: decoded.id });
            await project.save();
            res.status(201).json({ message: 'Project created', project });
        } catch (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Error creating project', error: err.message });
    }
});

// Fetch Projects
app.get('/api/projects', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ message: 'No token provided' });

        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            const projects = await Project.find({ owner: decoded.id });
            res.json(projects);
        } catch (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Error fetching projects', error: err.message });
    }
});

// Upload Assets
app.post('/api/assets', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const asset = new Asset({ name: req.file.originalname, path: req.file.path });
        await asset.save();
        res.status(201).json({ message: 'Asset uploaded', asset });
    } catch (err) {
        res.status(500).json({ message: 'Asset upload failed', error: err.message });
    }
});

// Physics Engine Integration Example
app.get('/api/physics-simulate', (req, res) => {
    Ammo().then(() => {
        const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        const overlappingPairCache = new Ammo.btDbvtBroadphase();
        const solver = new Ammo.btSequentialImpulseConstraintSolver();
        const dynamicsWorld = new Ammo.btDiscreteDynamicsWorld(
            dispatcher,
            overlappingPairCache,
            solver,
            collisionConfiguration
        );
        dynamicsWorld.setGravity(new Ammo.btVector3(0, -10, 0));
        res.json({ message: 'Physics world initialized' });
    });
});

// Chat with Socket.IO
io.on('connection', (socket) => {
    console.log('A user connected');

    // Send message history
    Message.find().then(messages => {
        socket.emit('messageHistory', messages);
    });

    socket.on('sendMessage', async (data) => {
        const message = new Message(data);
        await message.save();
        io.emit('newMessage', data);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
