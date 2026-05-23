// backend/server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const Tesseract = require('tesseract.js');

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
// 메모리 DB
// ======================

let refrigerator = [
  {
    id: '1',
    name: '서울우유 500ml',
    category: '냉장',
    expiryDate: '2026-04-15',
    quantity: 70,
    unit: '%'
  },
  {
    id: '2',
    name: '닭가슴살',
    category: '냉동',
    expiryDate: '2026-06-20',
    quantity: 2,
    unit: '개'
  },
  {
    id: '3',
    name: '양파',
    category: '실온',
    expiryDate: '2026-05-25',
    quantity: 3,
    unit: '개'
  }
];

// ======================
// 조회
// ======================

app.get('/api/ingredients', (req, res) => {

  res.json(refrigerator);

});

// ======================
// 추가
// ======================

app.post('/api/ingredients', (req, res) => {

  const {
    name,
    category,
    expiryDate,
    quantity,
    unit
  } = req.body;

  if (!name || !category || !expiryDate) {

    return res.status(400).json({
      error: '필수 입력값 누락'
    });

  }

  const newIngredient = {
    id: crypto.randomUUID(),
    name,
    category,
    expiryDate,
    quantity: quantity || 100,
    unit: unit || '%'
  };

  refrigerator.push(newIngredient);

  res.status(201).json(newIngredient);

});

// ======================
// 삭제
// ======================

app.delete('/api/ingredients/:id', (req, res) => {

  const { id } = req.params;

  refrigerator = refrigerator.filter(item => {

    return item.id !== id;

  });

  res.json({
    message: '삭제 완료'
  });

});

// ======================
// 수정
// ======================

app.put('/api/ingredients/:id', (req, res) => {

  const { id } = req.params;

  const {
    name,
    category,
    expiryDate,
    quantity,
    unit
  } = req.body;

  refrigerator = refrigerator.map(item => {

    if (item.id === id) {

      return {
        ...item,
        name,
        category,
        expiryDate,
        quantity,
        unit
      };

    }

    return item;

  });

  res.json({
    message: '수정 완료'
  });

});

// ======================
// 수량 감소
// ======================

app.patch('/api/ingredients/:id/decrease', (req, res) => {

  const { id } = req.params;

  refrigerator = refrigerator
    .map(item => {

      if (item.id === id) {

        let newQuantity;

        if (item.unit === '%') {

          newQuantity = item.quantity - 10;

        } else {

          newQuantity = item.quantity - 1;

        }

        return {
          ...item,
          quantity: newQuantity
        };

      }

      return item;

    })
    .filter(item => item.quantity > 0);

  res.json({
    message: '사용 완료'
  });

});

// ======================
// 수량 증가
// ======================

app.patch('/api/ingredients/:id/increase', (req, res) => {

  const { id } = req.params;

  refrigerator = refrigerator.map(item => {

    if (item.id === id) {

      let newQuantity;

      if (item.unit === '%') {

        newQuantity = Math.min(
          item.quantity + 10,
          100
        );

      } else {

        newQuantity = item.quantity + 1;

      }

      return {
        ...item,
        quantity: newQuantity
      };

    }

    return item;

  });

  res.json({
    message: '수량 증가 완료'
  });

});

// ======================
// OCR
// ======================

app.post('/api/ocr', upload.single('receipt'), async (req, res) => {

  try {

    if (!req.file) {

      return res.status(400).json({
        error: '파일 없음'
      });

    }

    const result = await Tesseract.recognize(
      req.file.path,
      'kor+eng'
    );

    const text = result.data.text;

    console.log('OCR 결과:', text);

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

    const correctionMap = {
      'AEH': '스팸',
      '심태': '김밥',
      '김반': '김밥',
      '후레시참치': '참치'
    };

    const lines = text.split('\n');

    lines.forEach(line => {

      Object.keys(correctionMap).forEach(wrong => {

        if (line.includes(wrong)) {

          possibleIngredients.push({
            id: crypto.randomUUID(),
            name: correctionMap[wrong],
            category: '냉장',
            expiryDate: '2026-12-31',
            quantity: 1,
            unit: '개'
          });

        }

      });

      foodKeywords.forEach(food => {

        if (line.includes(food)) {

          possibleIngredients.push({
            id: crypto.randomUUID(),
            name: food,
            category: '냉장',
            expiryDate: '2026-12-31',
            quantity: 1,
            unit: '개'
          });

        }

      });

    });

    const uniqueIngredients = [
      ...new Map(
        possibleIngredients.map(item => [
          item.name,
          item
        ])
      ).values()
    ];

    if (uniqueIngredients.length === 0) {

      return res.json({
        message: '식재료 인식 실패',
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

// ======================
// AI 레시피
// ======================

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

    const chatCompletion =
      await groq.chat.completions.create({

        messages: [
          {
            role: 'user',
            content: `
현재 냉장고 재료:
${ingredientNames}

이 재료들을 활용한
한국식 요리 레시피 1개 추천해줘.

조건:
- 한글만 사용
- 줄바꿈 깔끔하게
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
      error: 'AI 레시피 실패'
    });

  }

});

// ======================
// 쇼핑리스트
// ======================

app.get('/api/shopping-list', (req, res) => {

  const shoppingList = [];

  refrigerator.forEach(item => {

    if (
      item.unit === '%' &&
      item.quantity <= 20
    ) {

      shoppingList.push(
        `${item.name} 거의 다 사용함`
      );

    }

    if (
      item.unit === '개' &&
      item.quantity <= 1
    ) {

      shoppingList.push(
        `${item.name} 재구매 추천`
      );

    }

  });

  if (shoppingList.length === 0) {

    shoppingList.push(
      '현재 구매 추천 품목 없음'
    );

  }

  res.json({
    shoppingList
  });

});

// ======================
// 서버 실행
// ======================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

  console.log(
    `서버가 포트 ${PORT}에서 실행 중`
  );

});