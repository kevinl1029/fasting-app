const { app, initializeApp } = require('../server');

module.exports = async (req, res) => {
    try {
        await initializeApp();
        return app(req, res);
    } catch (error) {
        console.error('Failed to initialize Vercel function:', error);
        return res.status(500).json({
            error: 'Application initialization failed',
            code: 'INITIALIZATION_ERROR'
        });
    }
};
