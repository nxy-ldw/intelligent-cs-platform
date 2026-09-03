const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

let compression;
try { compression = require('compression'); } catch(e) { console.log('compression module not available, skipping'); }

const app = express();
const PORT = process.env.PORT || 3000;

if (compression) app.use(compression({ level: 6, threshold: 1024 }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/student', require('./routes/student'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/chat', require('./routes/chat'));

// 下载页面路由
app.get('/downloads', (req, res) => res.sendFile(path.join(__dirname, 'public', 'downloads.html')));
app.get('/download', (req, res) => res.redirect('/downloads'));

// 客户端下载路由
app.get('/downloads/ai-learning-diagnostic-windows.zip', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'downloads', 'ai-learning-diagnostic-windows.zip');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'AI学习诊断-Windows-v1.0.2.zip');
  } else {
    res.status(404).send('文件暂未上线，请稍后再试');
  }
});

app.get('/downloads/ai-learning-diagnostic-android.apk', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'downloads', 'ai-learning-diagnostic-android.apk');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'AI学习诊断-Android.apk');
  } else {
    res.status(404).send('文件暂未上线，请稍后再试');
  }
});

app.get('/student', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'index.html')));
app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, 'public', 'teacher', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat', 'index.html')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});
