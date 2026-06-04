// backend/server.js

require('dotenv').config();

const express =
  require('express');

const cors =
  require('cors');

const multer =
  require('multer');

const crypto =
  require('crypto');

const fs =
  require('fs');

const path =
  require('path');

const Groq =
  require('groq-sdk');

const Tesseract =
  require('tesseract.js');

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

  res.send(
    '냉장고 서버 정상 실행 중'
  );

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
  apiKey:
    process.env.GROQ_API_KEY
});

// ======================
// OCR
// ======================

app.post(
  '/api/ocr',
  upload.single('receipt'),
  async (req, res) => {

    try {

      if (!req.file) {

        return res
          .status(400)
          .json({
            error:
              '파일 없음'
          });

      }

      const filePath =
        path.resolve(req.file.path);

      console.log(
        'OCR file path:',
        filePath
      );

      const imageBuffer =
        fs.readFileSync(filePath);

      const result =
        await Tesseract.recognize(
          imageBuffer,
          'kor+eng'
        );

      const rawText =
        result.data.text || '';

      const text = rawText;

      console.log(
        'OCR 결과:',
        JSON.stringify(rawText)
      );

      const prompt = `다음은 영수증을 OCR로 인식한 텍스트입니다. 이 중에서 '식품' 또는 '식재료'에 해당하는 항목만 추출해주세요.
결과를 반드시 아래 형식의 JSON 객체로만 반환하세요. 다른 설명은 절대 하지 마세요.
{
  "items": [
    {
      "name": "식품명",
      "quantity": 1,
      "unit": "개"
    }
  ]
}

영수증 텍스트:
${rawText}`;

      let uniqueIngredients = [];

      try {
        const chatCompletion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.1-8b-instant',
          temperature: 0.1
        });

        const content = chatCompletion.choices[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.items && Array.isArray(parsed.items)) {
            uniqueIngredients = parsed.items.map(item => ({
              id: crypto.randomUUID(),
              name: item.name || '알 수 없는 식품',
              category: '냉장',
              expiryDate: '2026-12-31',
              quantity: item.quantity || 1,
              unit: item.unit || '개'
            }));
          }
        }
      } catch (err) {
        console.error("LLM 기반 파싱 중 오류 발생:", err);
      }

      if (uniqueIngredients.length === 0) {
        return res.json({
          success: true,
          message: '식재료 인식 실패',
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

      console.error(error);

      res.status(500).json({

        error:
          'OCR 처리 실패'

      });

    }

  }
);

// ======================
// AI 레시피
// ======================

app.get(
  '/api/ai-recipe',
  async (req, res) => {

    try {

      const ingredients =
        req.query.ingredients;

      if (!ingredients) {

        return res.json({

          recipe:
            '재료가 없습니다.'

        });

      }

      const chatCompletion =
        await groq.chat
          .completions
          .create({

          messages: [
            {
              role: 'user',

              content: `

현재 냉장고 재료:
${ingredients}

중요:

남은기간이 적은 재료를
최우선으로 소비할 수 있는
레시피를 추천해줘.

남은기간 7일 이하 재료는
반드시 우선 사용해줘.

유통기한이 많이 남은 재료보다
임박한 재료를 먼저 사용해줘.

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
- 집에서 쉽게 가능하게

`
            }
          ],

          model:
            'llama-3.1-8b-instant'

        });

      let recipe =

        chatCompletion
          .choices[0]
          ?.message
          ?.content

        || '레시피 생성 실패';

      recipe =
        recipe.replace(
          /\[\d+\]/g,
          ''
        );

      res.json({
        recipe
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'AI 레시피 실패'

      });

    }

  }
);

// ======================
// 서버 실행
// ======================

const PORT =
  process.env.PORT || 5000;

app.listen(PORT, () => {

  console.log(

    `서버가 포트 ${PORT}에서 실행 중`

  );

});