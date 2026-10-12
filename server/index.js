import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDB } from './db.js';
import { router as authRouter } from './routes/auth.js';
import userRouter from './routes/user.js';
import { chatRouter } from './routes/chat.js';
import { router as extractRouter } from './routes/extract.js';
import { ocrRouter } from './routes/ocr.js';
import ragRouter from './routes/rag.js';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '30mb' }));

// 路由
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/chat', chatRouter);
app.use('/api', extractRouter);
app.use('/api', ocrRouter);
app.use('/api/rag', ragRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 启动
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    console.log('Server will start without database. Using fallback mode.');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT} (fallback mode)`);
    });
  }
}

start();