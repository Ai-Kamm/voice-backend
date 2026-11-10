const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const { AccessToken } = require('livekit-server-sdk');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Базовый эндпоинт для проверки работоспособности
app.get('/', (req, res) => {
  res.json({ status: 'Voice backend is running successfully!' });
});

// Эндпоинт для генерации речи через ElevenLabs (Text-to-Speech)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice_id } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const selectedVoiceId = voice_id || 'pNInz6obpgDQGcFmaJgB';
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY is missing in environment variables' });
    }

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );

    res.set('Content-Type', 'audio/mpeg');
    res.send(response.data);

  } catch (error) {
    console.error('ElevenLabs Error:', error.response?.data?.toString() || error.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// Эндпоинт для распознавания речи через Deepgram (Speech-to-Text)
app.post('/api/stt', express.raw({ type: ['audio/*', 'application/octet-stream', 'multipart/form-data'], limit: '10mb' }), async (req, res) => {
  try {
    const audioBuffer = req.body;
    
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'Audio file is required in request body' });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'DEEPGRAM_API_KEY is missing in environment variables' });
    }

    const response = await axios.post(
      'https://api.deepgram.com/v1/listen?model=nova-2&language=ru',
      audioBuffer,
      {
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': req.headers['content-type'] || 'audio/mp3'
        }
      }
    );

    const transcript = response.data.results?.channels[0]?.alternatives[0]?.transcript || '';
    res.json({ transcript });

  } catch (error) {
    console.error('Deepgram Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// Эндпоинт для генерации токена LiveKit (видеозвонки в реальном времени)
app.get('/api/token', async (req, res) => {
  try {
    const roomName = req.query.room || 'zoom-room-1';
    const participantName = req.query.username || 'User_' + Math.floor(Math.random() * 1000);

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      return res.status(500).json({ error: 'LiveKit credentials are missing on server' });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
    });
    
    at.addGrant({ 
      roomJoin: true, 
      room: roomName, 
      canPublish: true, 
      canSubscribe: true 
    });

    const token = await at.toJwt();

    res.json({
      token,
      wsUrl,
      roomName,
      participantName
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
