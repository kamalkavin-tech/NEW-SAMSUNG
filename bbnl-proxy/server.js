const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from parent directory (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '..')));

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
        {
            chid: "371",
            bcid: "59",
            grid: "11",
            langid: "9",
            chno: "234",
            chtitle: "Chintu TV",
            chprice: "1.00",
            chdetails: null,
            chlogo: "http://124.40.244.211/netmon/assets/site_images/chnlnoimage.jpg",
            streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            subscribed: "true"
        },
        {
            chid: "363",
            bcid: "57",
            grid: "13",
            langid: "9",
            chno: "257",
            chtitle: "Star Sports 1 Kannada",
            chprice: "2.00",
            chdetails: null,
            chlogo: "http://124.40.244.211/netmon/assets/site_images/chnlnoimage.jpg",
            streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            subscribed: "true"
        },
        {
            chid: "503",
            bcid: "69",
            grid: "3",
            langid: "9",
            chno: "262",
            chtitle: "Colors Kannada",
            chprice: "1.50",
            chdetails: "<p>Colors Kannada SD</p>",
            chlogo: "http://124.40.244.211/netmon/assets/site_images/chnlnoimage.jpg",
            streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            subscribed: "true"
        },
        {
            chid: "101",
            bcid: "10",
            grid: "1",
            langid: "9",
            chno: "101",
            chtitle: "Zee Kannada",
            chprice: "1.50",
            chdetails: "Entertainment channel",
            chlogo: "http://124.40.244.211/netmon/assets/site_images/chnlnoimage.jpg",
            streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            subscribed: "true"
        },
        {
            chid: "102",
            bcid: "11",
            grid: "2",
            langid: "9",
            chno: "102",
            chtitle: "Suvarna News 24x7",
            chprice: "1.00",
            chdetails: "News channel",
            chlogo: "http://124.40.244.211/netmon/assets/site_images/chnlnoimage.jpg",
            streamlink: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            subscribed: "true"
        }
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
    console.log('Request params:', {
        userid: req.body.userid,
        mobile: req.body.mobile
    });
    // API returns [{ body: [{ categories: ... }] }] or similar nested structure usually
    // Based on user provided db.json structure earlier:
    res.json([{ body: MOCK_DATA.categories }]);
});

// 4. Channel Data (PRIMARY endpoint - works with production)
app.post('/chnl_data', (req, res) => {
    console.log('[POST] /chnl_data', req.body);
    console.log('Request params:', {
        userid: req.body.userid,
        mobile: req.body.mobile,
        ip_address: req.body.ip_address,
        mac_address: req.body.mac_address,
        langid: req.body.langid,
        grid: req.body.grid
    });

    // Return format matching production API
    res.json([{ body: MOCK_DATA.channels }]);
});

// 4b. Channel List (PRODUCTION API format - tested in Postman)
app.post('/chnl_list', (req, res) => {
    console.log('[POST] /chnl_list', req.body);
    console.log('Request params:', {
        userid: req.body.userid,
        mobile: req.body.mobile,
        ip_address: req.body.ip_address,
        mac_address: req.body.mac_address
    });

    // PRODUCTION RESPONSE FORMAT (matches Postman exactly)
    res.json({
        body: [{
            channels: MOCK_DATA.channels
        }]
    });
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
