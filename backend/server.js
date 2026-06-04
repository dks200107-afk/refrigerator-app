// backend/server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const Tesseract = require('tesseract.js');
const Jimp = require('jimp');

const app = express();

// ======================
// CORS
// ======================

app.use(cors({
  origin: '*'
}));

app.use(express.json());

// ======================
// ROOT
// ======================

app.get('/', (req, res) => {
  res.send('냉장고 서버 정상 실행 중');
});

// ======================
// multer
// ======================

const upload = multer({
  dest: 'uploads/'
});

// ======================
// GROQ
// ======================

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ======================
// OCR 전처리
// ======================

const preprocessReceiptImage = async (buffer) => {
  try {
    let image = await Jimp.read(buffer);

    // 이미지 크기 정규화
    const maxWidth = 2000;
    const maxHeight = 2500;
    
    if (image.bitmap.width > maxWidth || image.bitmap.height > maxHeight) {
      image.scaleToFit(maxWidth, maxHeight);
    }

    // 회색조 변환
    image.greyscale();

    // 대비 증가 (여러 번)
    for (let i = 0; i < 2; i++) {
      image.contrast(0.4);
    }

    // 밝기 조정
    image.brightness(0.1);

    // 샤픈 필터 (선명도 개선)
    image.sharpen();

    // 노이즈 제거를 위한 Dilate 효과
    const kernel = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ];

    // 이진화 (Binary thresholding) - 더 공격적
    const threshold = 170;
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      const gray = this.bitmap.data[idx];
      const value = gray > threshold ? 255 : 0;
      this.bitmap.data[idx] = value;
      this.bitmap.data[idx + 1] = value;
      this.bitmap.data[idx + 2] = value;
      this.bitmap.data[idx + 3] = 255;
    });

    return await image.getBuffer(Jimp.MIME_PNG);
  } catch (err) {
    console.error('Image preprocessing error:', err);
    throw err;
  }
};

const cleanOcrText = (text) => {
  if (!text) return '';
  
  return text
    .split('\n')
    .map(line => {
      // 한글, 영문, 숫자, 기본 기호만 유지
      return line
        .replace(/[^가-힣a-zA-Z0-9\s\.\,\-\:\(\)\/\+\%]/g, '')
        .replace(/[\t ]+/g, ' ')
        .trim();
    })
    .filter(line => line.length > 0)
    .join('\n')
    .trim();
};

// ======================
// OCR
// ======================

app.post('/api/ocr', upload.single('receipt'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        error: '파일 없음'
      });
    }

    filePath = path.resolve(req.file.path);
    console.log('OCR file path:', filePath);

    const imageBuffer = fs.readFileSync(filePath);

    let preprocessedBuffer;
    try {
      preprocessedBuffer = await preprocessReceiptImage(imageBuffer);
    } catch (err) {
      console.error('Preprocessing failed, using original:', err.message);
      preprocessedBuffer = imageBuffer;
    }

    // Tesseract 옵션 최적화
    const result = await Tesseract.recognize(
      preprocessedBuffer,
      'kor+eng',
      {
        tessedit_pageseg_mode: 3,        // Fully automatic page segmentation
        tessedit_ocr_engine_mode: 1,      // LSTM only
        preserve_interword_spaces: '1'
      }
    );

    const rawText = result.data.text || '';
    const text = cleanOcrText(rawText);

    console.log('OCR confidence:', result.data.confidence);
    console.log('OCR Result:', JSON.stringify(text));

    const prompt = `다음은 영수증 OCR 텍스트입니다. 이 중에서 실제 식품/식재료 항목을 찾아 추출하세요.
숫자만 있거나 의미 없는 텍스트는 제외하세요.

반드시 JSON 형식으로만 응답:
{
  "items": [
    {
      "name": "식품명(영어/한글)",
      "quantity": 1,
      "unit": "개"
    }
  ]
}

영수증 OCR 텍스트:
${text}`;

    let uniqueIngredients = [];

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        max_tokens: 500
      });

      const content = chatCompletion.choices[0]?.message?.content || "";
      console.log('LLM Response:', content);
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
            uniqueIngredients = parsed.items
              .filter(item => item.name && item.name.trim().length > 0)
              .slice(0, 10)
              .map(item => ({
                id: crypto.randomUUID(),
                name: item.name.trim(),
                category: '냉장',
                expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                quantity: item.quantity || 1,
                unit: item.unit || '개'
              }));
          }
        } catch (parseErr) {
          console.error('JSON parse error:', parseErr.message);
        }
      }
    } catch (err) {
      console.error("LLM error:", err.message);
    }

    if (uniqueIngredients.length === 0) {
      return res.json({
        success: true,
        message: '식재료 인식 실패 - 영수증 이미지를 다시 확인해주세요',
        data: [],
        ingredients: [],
        ocrText: text
      });
    }

    res.json({
      success: true,
      data: uniqueIngredients,
      ingredients: uniqueIngredients,
      ocrText: text
    });

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({
      error: 'OCR 처리 실패',
      details: error.message
    });
  } finally {
    // 파일 정리 (동기 처리로 변경)
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('File cleaned:', filePath);
      } catch (err) {
        console.error('File cleanup error:', err.message);
      }
    }
  }
});

// ======================
// AI 레시피
// ======================

app.get('/api/ai-recipe', async (req, res) => {
  try {
    const ingredients = req.query.ingredients;

    if (!ingredients) {
      return res.json({
        recipe: '재료가 없습니다.'
      });
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: `현재 냉장고 재료:
${ingredients}

중요:
남은기간이 적은 재료를 최우선으로 소비할 수 있는 레시피를 추천해줘.
남은기간 7일 이하 재료는 반드시 우선 사용해줘.
유통기한이 많이 남은 재료보다 임박한 재료를 먼저 사용해줘.

조건:
- 반드시 한글만 사용
- 영어 사용 금지
- 한자 사용 금지
- 일본어 사용 금지
- 중국어 사용 금지
- 재료명도 한글만 사용
- 누구나 이해하기 쉽게
- 어려운 요리 금지
- 재료 / 조리순서 구분
- 짧고 깔끔하게
- 집에서 쉽게 가능하게`
        }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7
    });

    const recipe = chatCompletion.choices[0]?.message?.content || '레시피 생성 실패';

    res.json({
      recipe: recipe
    });

  } catch (error) {
    console.error('AI Recipe Error:', error);
    res.status(500).json({
      error: 'AI 레시피 생성 실패'
    });
  }
});

// ======================
// PORT
// ======================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중`);
});
