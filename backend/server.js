// backend/server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const Tesseract = require('tesseract.js');

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

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


// =============================
// 1. 식재료 조회
// =============================
app.get('/api/ingredients', (req, res) => {
  res.json(refrigerator);
});


// =============================
// 2. 식재료 추가
// =============================
app.post('/api/ingredients', (req, res) => {

  const { name, category, expiryDate } = req.body;

  if (!name || !category || !expiryDate) {
    return res.status(400).json({
      error: '필수 입력값 누락'
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


// =============================
// 3. 식재료 삭제
// =============================
app.delete('/api/ingredients/:id', (req, res) => {

  const { id } = req.params;

  refrigerator = refrigerator.filter(item => item.id !== id);

  res.json({
    message: '삭제 완료'
  });

});


// =============================
// 4. OCR 영수증 인식
// =============================
app.post('/api/ocr', upload.single('receipt'), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({
        error: '파일이 없습니다.'
      });
    }

    // OCR 실행
    const result = await Tesseract.recognize(
      req.file.path,
      'kor+eng'
    );

    const text = result.data.text;

    console.log("OCR 결과:", text);

    const possibleIngredients = [];

    // 기본 키워드
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

    // OCR 오인식 보정
    const correctionMap = {
      'AEH': '스팸',
      '심태': '김밥',
      '김반': '김밥',
      '후레시참치': '참치'
    };

    const lines = text.split('\n');

    lines.forEach(line => {

      // 오인식 보정 탐색
      Object.keys(correctionMap).forEach(wrong => {

        if (line.includes(wrong)) {

          possibleIngredients.push({
            id: crypto.randomUUID(),
            name: correctionMap[wrong],
            category: '냉장',
            expiryDate: '2026-12-31'
          });

        }

      });

      // 일반 키워드 탐색
      foodKeywords.forEach(food => {

        if (line.includes(food)) {

          possibleIngredients.push({
            id: crypto.randomUUID(),
            name: food,
            category: '냉장',
            expiryDate: '2026-12-31'
          });

        }

      });

    });

    // 중복 제거
    const uniqueIngredients = [
      ...new Map(
        possibleIngredients.map(item => [item.name, item])
      ).values()
    ];

    // 아무것도 못 찾았을 경우
    if (uniqueIngredients.length === 0) {

      return res.json({
        message: '식재료를 찾지 못했습니다.',
        ocrText: text
      });

    }

    refrigerator.push(...uniqueIngredients);

    res.json({
      message: 'OCR 등록 완료',
      data: uniqueIngredients,
      ocrText: text
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'OCR 처리 실패'
    });

  }

});


// =============================
// 5. AI 레시피 추천
// =============================
app.get('/api/ai-recipe', async (req, res) => {

  try {

    const ingredientNames = refrigerator
      .map(item => item.name)
      .join(', ');

    if (!ingredientNames) {

      return res.json({
        recipe: '냉장고가 비어있습니다.'
      });

    }

    const chatCompletion = await groq.chat.completions.create({

      messages: [
        {
          role: 'user',
          content: `
현재 냉장고 재료:
${ingredientNames}

이 재료를 최대한 활용한
한국식 요리 레시피 1개 추천해줘.

반드시:
- 한글만 사용
- 보기 쉽게 줄바꿈
- 재료/조리법 구분
`
        }
      ],

      model: 'llama-3.1-8b-instant'

    });

    let recipe =
      chatCompletion.choices[0]?.message?.content
      || '레시피 생성 실패';

    recipe = recipe.replace(/\[\d+\]/g, '');

    res.json({
      recipe
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'AI 레시피 생성 실패'
    });

  }

});


// =============================
// 6. 쇼핑리스트
// =============================
app.get('/api/shopping-list', (req, res) => {

  const today = new Date('2026-05-16');

  const urgentItems = refrigerator.filter(item => {

    const expiry = new Date(item.expiryDate);

    return expiry <= today;

  });

  const shoppingList = urgentItems.map(item =>
    `${item.name} 재구매 필요`
  );

  if (shoppingList.length === 0) {

    shoppingList.push(
      '우유 구매 추천'
    );

  }

  res.json({
    shoppingList
  });

});


// =============================
// 서버 실행
// =============================
const PORT = 5000;

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 작동 중입니다.`);
});