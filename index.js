const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');

const PORT = 3000;
const MONGO_URI = 'mongodb://127.0.0.1:27017/chat_app';

// Initialize Express and attach WebSocket functionality
const app = express();
const wsInstance = expressWs(app); // Attach WebSocket functionality

// MongoDB Schemas and Models
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    joinDate: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'chat-app-secret',
    resave: false,
    saveUninitialized: true
}));

// WebSocket Setup
app.ws('/ws', (socket, req) => {
    let username;

    // Handle incoming Websocket messages
    socket.on('message', async (rawMessage) => {
        const parsedMessage = JSON.parse(rawMessage);

        if (parsedMessage.type === 'new-user') {
            username = parsedMessage.username;
            broadcastMessage({
                type: 'notification',
                message: `User ${username} has joined the chat!`
            }, socket);
        } else if (parsedMessage.type === 'chat-message') {
            const { message } = parsedMessage;
            broadcastMessage({
                type: 'chat-message',
                sender: username,
                message,
                timestamp: new Date()
            }, socket);
        }
    });

    // Handle Websocket disconnection
    socket.on('close', () => {
        broadcastMessage({
            type: 'notification',
            message: `User ${username} has left the chat!`
        }, socket);
    });
});

// Utility function for broadcasting messages
function broadcastMessage(message, senderSocket) {
    const data = JSON.stringify(message);
    console.log("Broadcasting message:", message); // Log the broadcasting message
    wsInstance.getWss().clients.forEach((client) => {
        if (client !== senderSocket && client.readyState === client.OPEN) {
            client.send(data);
            console.log("Message sent to a client:", data); // Log each client message delivery
        }
    });
}

// Routes
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.render('index/unauthenticated');
    }
});
// GET Logout route
app.get('/login', (req, res) => {
    res.render('login', { errorMessage: null });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
      res.redirect('/');
  });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = { username: user.username, role: user.role };
        res.redirect('/dashboard');
    } else {
        res.render('login', { errorMessage: 'Invalid username or password.' });
    }
});

app.get('/signup', (req, res) => {
    res.render('signup', { errorMessage: null });
});

app.post('/signup', async (req, res) => {
    const { username, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.redirect('/login');
    } catch (error) {
        res.render('signup', { errorMessage: 'Username is already taken.' });
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('index/authenticated', { user: req.session.user });
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/profile/:username', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    const user = await User.findOne({ username: req.params.username });
    if (user) {
        res.render('profile', { user });
    } else {
        res.status(404).send('User not found');
    }
});

app.get('/admin', async (req, res) => {
    if (req.session.user?.role !== 'admin') return res.status(403).send('Forbidden');

    const users = await User.find();
    res.render('admin', { users });
});

app.post('/admin/ban/:username', async (req, res) => {
    if (req.session.user?.role !== 'admin') return res.status(403).send('Forbidden');

    await User.deleteOne({ username: req.params.username });
    res.redirect('/admin');
});

mongoose.connect(MONGO_URI)
    .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
    .catch((err) => console.error('MongoDB connection error:', err));
