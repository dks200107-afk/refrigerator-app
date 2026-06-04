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

const chooseBestOcrText = (texts) => {
  const scored = texts.map(text => {
    const koreanCount = (text.match(/[가-힣]/g) || []).length;
    const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
    const digitCount = (text.match(/[0-9]/g) || []).length;
    return {
      text,
      score: koreanCount * 3 + alphaCount * 2 + digitCount
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.text || '';
};

const normalizeProductName = (name) => {
  let normalized = name.replace(/\s+/g, ' ').trim();
  normalized = normalized.replace(/\s*([0-9]+)\s*(g|G)?$/i, '$1G');

  if (/비타.*심태/i.test(normalized)) {
    return '비타김밥단무지';
  }

  if (/비타.*김밥.*단무지/i.test(normalized) || /비타김밥단무지/i.test(normalized)) {
    return '비타김밥단무지';
  }

  if (/스팸.*340/i.test(normalized)) {
    return '스팸 340G';
  }

  if (/활동.*825/i.test(normalized)) {
    return normalized.replace(/활동\s*825/i, '활동825G');
  }

  normalized = normalized.replace(/\s+g$/i, 'G');
  normalized = normalized.replace(/\s+kg$/i, 'KG');

  if (/\d+x?$/.test(normalized)) {
    return normalized;
  }

  return normalized;
};

const isReceiptNumericToken = (token) => {
  return /^\d{1,3}(?:[\.,]\d{3})?(?:원|W|₩)?$/i.test(token)
    || /^\d+G$/i.test(token)
    || /^\d+KG$/i.test(token)
    || /^\d+$/i.test(token);
};

const heuristicExtractItems = (text) => {
  const lines = text
    .split('\n')
    .map(line => line.replace(/[^가-힣A-Za-z0-9\s\.\,\-\:\(\)\/\+\%]/g, ' ').trim())
    .filter(line => line.length > 1);

  const candidates = [];

  for (const line of lines) {
    if (/^[0-9\s\.,]+$/.test(line)) continue;
    if (/^(합계|총액|현금|카드|잔액|포인트|쿠폰)/i.test(line)) continue;
    const cleaned = line.replace(/\s{2,}/g, ' ').trim();
    const tokens = cleaned.split(/\s+/);
    while (tokens.length > 0 && isReceiptNumericToken(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    const priceRemoved = tokens.join(' ').trim();

    if (priceRemoved.length > 1 && /[가-힣]/.test(priceRemoved)) {
      candidates.push(normalizeProductName(priceRemoved));
    }
  }

  const uniqueNames = [...new Set(candidates)]
    .slice(0, 10)
    .map(name => normalizeProductName(name));

  return uniqueNames
    .filter(name => name && name.length > 1)
    .map(name => ({ name, quantity: 1, unit: '개' }));
};

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

    // 샤픈 효과
    const sharpenKernel = [
      [ 0, -1,  0],
      [-1,  5, -1],
      [ 0, -1,  0]
    ];
    if (typeof image.convolute === 'function') {
      image.convolute(sharpenKernel);
    }

    image.normalize();
    image.quality(100);

    return await image.getBufferAsync(Jimp.MIME_PNG);
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

const recognizeTextWithTesseract = async (buffer) => {
  const psmModes = [3, 4, 6];
  const texts = [];

  for (const psm of psmModes) {
    try {
      const result = await Tesseract.recognize(buffer, 'kor+eng', {
        tessedit_ocr_engine_mode: 3,
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
      });

      if (result?.data?.text) {
        texts.push(result.data.text);
      }
    } catch (err) {
      console.error(`Tesseract OCR error (PSM ${psm}):`, err);
    }
  }

  return texts;
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

    const ocrTexts = [];
    let preprocessedBuffer;

    try {
      preprocessedBuffer = await preprocessReceiptImage(imageBuffer);
    } catch (err) {
      console.error('Preprocessing failed, using original:', err.message);
      preprocessedBuffer = imageBuffer;
    }

    const preprocessedResults = await recognizeTextWithTesseract(preprocessedBuffer);
    ocrTexts.push(...preprocessedResults);

    if (imageBuffer !== preprocessedBuffer) {
      const originalResults = await recognizeTextWithTesseract(imageBuffer);
      ocrTexts.push(...originalResults);
    }

    const rawText = chooseBestOcrText(ocrTexts);
    const text = cleanOcrText(rawText);
    const heuristicItems = heuristicExtractItems(text);

    console.log('OCR Result:', JSON.stringify(text));
    console.log('Heuristic items:', heuristicItems);

    const uniqueIngredients = heuristicItems;

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
