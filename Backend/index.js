const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const app = express();

app.use(cors());
app.use(express.json());

// Route to download audio as mp3
app.get('/api/download', async (req, res) => {
  const videoUrl = req.query.url;
  if (!ytdl.validateURL(videoUrl)) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }
  const info = await ytdl.getInfo(videoUrl);
  const title = info.videoDetails.title;
  res.header('Content-Disposition', `attachment; filename="${title}.mp3"`);
  ytdl(videoUrl, { filter: 'audioonly', format: 'mp3', quality: 'highestaudio' })
    .pipe(res);
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
