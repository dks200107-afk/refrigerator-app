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

      const result =
        await Tesseract.recognize(
          req.file.path,
          'kor+eng'
        );

      const text =
        result.data.text;

      console.log(
        'OCR 결과:',
        text
      );

      const possibleIngredients =
        [];

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

      const lines =
        text.split('\n');

      lines.forEach(line => {

        Object.keys(
          correctionMap
        ).forEach(wrong => {

          if (
            line.includes(wrong)
          ) {

            possibleIngredients
              .push({

              id:
                crypto.randomUUID(),

              name:
                correctionMap[
                  wrong
                ],

              category:
                '냉장',

              expiryDate:
                '2026-12-31',

              quantity: 1,

              unit: '개'

            });

          }

        });

        foodKeywords.forEach(
          food => {

          if (
            line.includes(food)
          ) {

            possibleIngredients
              .push({

              id:
                crypto.randomUUID(),

              name: food,

              category:
                '냉장',

              expiryDate:
                '2026-12-31',

              quantity: 1,

              unit: '개'

            });

          }

        });

      });

      const uniqueIngredients = [

        ...new Map(
          possibleIngredients.map(
            item => [
              item.name,
              item
            ]
          )
        ).values()

      ];

      if (
        uniqueIngredients.length
        === 0
      ) {

        return res.json({

          message:
            '식재료 인식 실패',

          ocrText: text

        });

      }

      res.json({

        message:
          'OCR 등록 완료',

        data:
          uniqueIngredients,

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

이 재료들로 만들 수 있는
초보자도 따라하기 쉬운
한국 요리 레시피 1개 추천해줘.

조건:
- 한글만 사용
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