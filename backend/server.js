// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const Tesseract = require('tesseract.js')

require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Groq API 설정
const apiKey =
  process.env.GROQ_API_KEY;

const groq = new Groq({ apiKey });

// 메모리 DB
let refrigerator = [
  {
    id: '1',
    name: '서울우유 500ml',
    category: '냉장',
    expiryDate: '2026-04-15'
  },
  {
    id: '2',
    name: '닭가슴살',
    category: '냉동',
    expiryDate: '2026-06-20'
  },
  {
    id: '3',
    name: '양파',
    category: '실온',
    expiryDate: '2026-05-25'
  }
];


// =======================================
// 1. 식재료 목록 조회
// =======================================
app.get('/api/ingredients', (req, res) => {
  res.json(refrigerator);
});


// =======================================
// 2. 식재료 추가
// =======================================
app.post('/api/ingredients', (req, res) => {
  const { name, category, expiryDate } = req.body;

  if (!name || !category || !expiryDate) {
    return res.status(400).json({
      error: '필수 입력 항목이 누락되었습니다.'
    });
  }

  const newIngredient = {
    id: crypto.randomUUID(),
    name,
    category,
    expiryDate
  };

  refrigerator.push(newIngredient);

  res.status(201).json(newIngredient);
});


// =======================================
// 3. 식재료 삭제 추가 ⭐
// =======================================
app.delete('/api/ingredients/:id', (req, res) => {
  const { id } = req.params;

  // 삭제 전 존재 여부 확인
  const existingItem = refrigerator.find(item => item.id === id);

  if (!existingItem) {
    return res.status(404).json({
      error: '해당 식재료를 찾을 수 없습니다.'
    });
  }

  // 삭제 처리
  refrigerator = refrigerator.filter(item => item.id !== id);

  res.json({
    message: '식재료 삭제 완료',
    deletedId: id
  });
});


// 3. 영수증 OCR
app.post('/api/ocr', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 없습니다.' });
    }

    // OCR 실행
    const result = await Tesseract.recognize(
      req.file.path,
      'kor+eng'
    );

    const text = result.data.text;

    console.log("OCR 결과:", text);

    const possibleIngredients = [];

   const foodKeywords = [
  '우유',
  '계란',
  '두부',
  '대파',
  '양파',
  '김치',
  '삼겹살',
  '닭가슴살',
  '콜라',
  '치즈',
  '햄',
  '라면',
  '아이스크림',
  '스팸',
  '야채',
  '김밥',
  '참치',
  '만두',
  '소시지',
  '빵',
  '과자',
  '음료',
  '사이다',
  '김',
  '쌀',
  '고기',
  '돼지',
  '소고기',
  '치킨',
  '요거트',
  '바나나',
  '사과'
];

    foodKeywords.forEach(food => {
      if (text.includes(food)) {
        possibleIngredients.push({
          id: crypto.randomUUID(),
          name: food,
          category: '냉장',
          expiryDate: '2026-12-31'
        });
      }
    });

    if (possibleIngredients.length === 0) {
      return res.json({
        message: '식재료를 찾지 못했습니다.',
        ocrText: text
      });
    }

    refrigerator.push(...possibleIngredients);

    res.json({
      message: 'OCR 등록 완료',
      data: possibleIngredients,
      ocrText: text
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'OCR 처리 실패' });
  }
});


// =======================================
// 5. AI 레시피 추천
// =======================================
app.get('/api/ai-recipe', async (req, res) => {
  try {
    const ingredientNames = refrigerator
      .map(item => item.name)
      .join(', ');

    if (!ingredientNames) {
      return res.json({
        recipe:
          '냉장고가 비어있네요! 식재료를 먼저 등록해 주세요.'
      });
    }

    const chatCompletion =
      await groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: `
현재 내 냉장고에 [${ingredientNames}] 재료들이 있어.

이 재료들을 최대한 활용해서 만들 수 있는
맛있는 한국식 요리 레시피 1개를 추천해줘.

반드시 순수 한국어만 사용하고,
줄바꿈을 예쁘게 해줘.
`
          }
        ],
        model: 'llama-3.1-8b-instant'
      });

    let freeRecipe =
      chatCompletion.choices[0]?.message?.content ||
      '레시피를 생성할 수 없습니다.';

    // AI 이상 문자 제거
    freeRecipe = freeRecipe.replace(/【.*?】/g, '');
    freeRecipe = freeRecipe.replace(/\[\d+\]/g, '');
    freeRecipe = freeRecipe.trim();

    res.json({
      recipe: freeRecipe
    });

  } catch (error) {
    console.error('AI 요청 에러:', error);

    res.status(500).json({
      error:
        '무료 AI 레시피를 불러오는 중 오류가 발생했습니다.'
    });
  }
});


// =======================================
// 6. 쇼핑 리스트 추천
// =======================================
app.get('/api/shopping-list', (req, res) => {
  const today = new Date('2026-05-16');

  const urgentItems = refrigerator.filter(item => {
    const expiry = new Date(item.expiryDate);

    return expiry <= today;
  });

  const shoppingList = urgentItems.map(
    item => `${item.name} (유통기한 경과/재구매 필요)`
  );

  if (shoppingList.length === 0) {
    shoppingList.push(
      '우유 (소비 패턴 분석 기반 추천 품목)'
    );
  }

  res.json({
    shoppingList
  });
});


// =======================================
// 서버 실행
// =======================================
const PORT = 5000;

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 작동 중입니다.`);
});