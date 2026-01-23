const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Mock Data
const MOCK_DATA = {
    login: { status: "success", message: "OTP Sent", userid: "testiser1" },
    loginOtp: {
        status: "success",
        userid: "testiser1",
        mobile: "7800000001",
        bbnl_authenticated: true,
        session_token: "mock-session-123",
        user_name: "Test User",
        profile_img: "avatar1.png"
    },
    categories: [
        {
            categories: [
                { id: "1", category_name: "Entertainment", grid: "1" },
                { id: "2", category_name: "News", grid: "2" },
                { id: "3", category_name: "Sports", grid: "3" },
                { id: "4", category_name: "Movies", grid: "4" },
                { id: "5", category_name: "Music", grid: "5" }
            ]
        }
    ],
    channels: [
        { id: "101", channel_name: "Colors Super TV", grid: "1", streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", logo_url: "https://upload.wikimedia.org/wikipedia/en/thumb/9/91/Colors_Super_logo.png/180px-Colors_Super_logo.png" },
        { id: "102", channel_name: "BBC News", grid: "2", streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
        { id: "103", channel_name: "Star Sports", grid: "3", streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
        { id: "104", channel_name: "HBO", grid: "4", streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
        { id: "105", channel_name: "MTV", grid: "5", streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }
    ],
    ads: [
        { id: "1", adpath: "https://via.placeholder.com/1920x1080.png?text=BBNL+Ad", displayarea: "homepage" }
    ]
};

// Routes

// 1. Login (Request OTP)
app.post('/login', (req, res) => {
    console.log('[POST] /login', req.body);
    // Mimic API behavior: success
    res.json(MOCK_DATA.login);
});

// 2. Verify OTP
app.post('/loginOtp', (req, res) => {
    console.log('[POST] /loginOtp', req.body);
    res.json(MOCK_DATA.loginOtp);
});

// 3. Categories
app.post('/chnl_categlist', (req, res) => {
    console.log('[POST] /chnl_categlist', req.body);
    // API returns [{ body: [{ categories: ... }] }] or similar nested structure usually
    // Based on user provided db.json structure earlier:
    res.json([{ body: MOCK_DATA.categories }]);
});

// 4. Channel Data
app.post('/chnl_data', (req, res) => {
    console.log('[POST] /chnl_data', req.body);
    res.json([{ body: MOCK_DATA.channels }]);
});

// 5. Ads
app.post('/iptvads', (req, res) => {
    console.log('[POST] /iptvads', req.body);
    res.json([{ body: MOCK_DATA.ads }]);
});

// Root check
app.get('/', (req, res) => {
    res.send('BBNL Proxy Server Running');
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`BBNL Proxy Server running on port ${PORT}`);
});
