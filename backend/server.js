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
  const scoreText = (text) => {
    const cleaned = text.replace(/[^가-힣a-zA-Z0-9\s\.\,\-\:\(\)\/\+\%]/g, '');
    const koreanCount = (cleaned.match(/[가-힣]/g) || []).length;
    const alphaCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
    const digitCount = (cleaned.match(/[0-9]/g) || []).length;
    const punctuationCount = (cleaned.match(/[\.\,\-\:\(\)\/\+\%]/g) || []).length;
    const totalChars = cleaned.length || 1;
    const badRatio = 1 - (koreanCount + alphaCount + digitCount) / totalChars;

    return koreanCount * 4 + alphaCount * 3 + digitCount * 1 - punctuationCount * 2 - badRatio * 10;
  };

  const scored = texts
    .filter(text => text && text.trim().length > 0)
    .map(text => ({
      text,
      score: scoreText(text)
    }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.text || '';
};

const cleanReceiptLine = (line) => {
  return line
    .replace(/[^가-힣A-Za-z0-9\s\.\,\-\:\(\)\/\+\%]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const scoreReceiptLine = (line) => {
  const cleaned = cleanReceiptLine(line);
  const koreanCount = (cleaned.match(/[가-힣]/g) || []).length;
  const alphaCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
  const digitCount = (cleaned.match(/[0-9]/g) || []).length;
  const punctuationCount = (cleaned.match(/[\.\,\-\:\(\)\/\+\%]/g) || []).length;
  const totalChars = cleaned.length || 1;
  const badRatio = 1 - (koreanCount + alphaCount + digitCount) / totalChars;
  return koreanCount * 5 + alphaCount * 3 + digitCount * 1 - punctuationCount * 2 - badRatio * 10;
};

const mergeOcrTexts = (texts) => {
  const linesMap = new Map();

  for (const text of texts) {
    if (!text) continue;
    for (let rawLine of text.split(/\r?\n/)) {
      const line = cleanReceiptLine(rawLine);
      if (!line) continue;
      const score = scoreReceiptLine(line);
      const existing = linesMap.get(line);
      if (existing) {
        existing.count += 1;
        existing.score = Math.max(existing.score, score);
      } else {
        linesMap.set(line, {
          line,
          count: 1,
          score
        });
      }
    }
  }

  return [...linesMap.values()]
    .sort((a, b) => b.count - a.count || b.score - a.score)
    .map(entry => entry.line);
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

const isLikelyReceiptItemLine = (line) => {
  const cleaned = cleanReceiptLine(line);
  if (!cleaned || cleaned.length < 3) return false;
  if (/^(합계|총액|현금|카드|잔액|포인트|쿠폰|할인|부가세|세액|매장|계산서)/i.test(cleaned)) return false;
  if (/^[0-9\s\.,]+$/.test(cleaned)) return false;

  const tokens = cleaned.split(/\s+/);
  const longTokens = tokens.filter(t => t.length >= 2);
  const shortTokens = tokens.filter(t => t.length === 1);
  if (shortTokens.length > longTokens.length) return false;

  const alphaCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
  const koreanCount = (cleaned.match(/[가-힣]/g) || []).length;
  if (koreanCount + alphaCount < 2) return false;
  if (koreanCount < 2 && alphaCount < 2) return false;

  const punctuationCount = (cleaned.match(/[\.\,\-\:\(\)\/\+\%]/g) || []).length;
  if (punctuationCount > cleaned.length * 0.2) return false;

  if (/\b(LV|Lv|lv|ML|ml)\b/.test(cleaned)) return false;
  if (/\b(할\.|할)\b/.test(cleaned) && !/\b(할인)\b/.test(cleaned)) return false;
  if (/\b(명|가|해)\b/.test(cleaned) && cleaned.split(/\s+/).length < 3) return false;

  if (!/[가-힣]/.test(cleaned) && /^[0-9A-Za-z\s\.\,\-\:\(\)\/\+\%]+$/.test(cleaned)) return false;

  return true;
};

const extractProductName = (line) => {
  const cleaned = line.replace(/\s{2,}/g, ' ').trim();
  const tokens = cleaned.split(/\s+/);
  
  const productTokens = [];
  
  for (const token of tokens) {
    if (/[가-힣A-Za-z]/.test(token)) {
      productTokens.push(token);
    } else if (productTokens.length > 0) {
      break;
    }
  }
  
  return productTokens.join(' ');
};

const heuristicExtractItems = (text) => {
  const lines = text
    .split('\n')
    .map(line => line.replace(/[^가-힣A-Za-z0-9\s\.\,\-\:\(\)\/\+\%]/g, ' ').trim())
    .filter(line => line.length > 1);

  const candidates = [];

  for (const line of lines) {
    if (!isLikelyReceiptItemLine(line)) continue;

    const productName = extractProductName(line);

    if (productName.length > 1 && /[가-힣A-Za-z]/.test(productName)) {
      candidates.push(normalizeProductName(productName));
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
        user_defined_dpi: '300',
        tessedit_char_whitelist: '가-힣A-Za-z0-9.,-:()/%+'
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

    const mergedLines = mergeOcrTexts(ocrTexts);
    const text = mergedLines.length > 0 ? mergedLines.join('\n') : cleanOcrText(chooseBestOcrText(ocrTexts));
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
