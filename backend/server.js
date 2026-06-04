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

      const cleanedText =
        rawText
          .replace(/[|]+/g, '\n')
          .replace(/[^가-힣a-zA-Z0-9\n\r\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

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
        '참치캔',
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
        '사과',
        '한우',
        '앞다리',
        '비타',
        '나트리',
        '가지'

      ];

      const correctionMap = {

        'AEH': '스팸',
        '심태': '김밥',
        '김반': '김밥',
        '후레시참치': '참치'

      };

      const stopLinePatterns = [
        '품명',
        '단가',
        '금액',
        '계',
        '합계',
        '현금',
        '영수증',
        '감사합니다',
        '감사 합니다',
        'p02',
        'pos2',
        '번호',
        '총',
        '구매',
        '거래번호',
        '대표',
        '카드결제',
        '신한카드'
      ];

      const lines =
        cleanedText
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .filter(line =>
            !stopLinePatterns.some(pattern =>
              line.toLowerCase().includes(pattern)
            )
          );

      const extractNameFromLine = (line) => {
        const cleanedLine = line.replace(/\s+/g, ' ').trim();
        const amountMatch = cleanedLine.match(/^(.+?)\s+([0-9,]+)\s+([0-9,]+)\s+([0-9,]+)$/);
        if (amountMatch) {
          return amountMatch[1].trim();
        }

        const shortMatch = cleanedLine.match(/^(.+?)\s+([0-9,]+)\s+([0-9,]+)$/);
        if (shortMatch) {
          return shortMatch[1].trim();
        }

        if (/\d/.test(cleanedLine)) {
          return cleanedLine.replace(/[0-9,]+/g, '').trim();
        }

        return '';
      };

      lines.forEach(line => {

        const rawLine = line;
        const normalizedLine =
          rawLine
            .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '')
            .trim();

        let matched = false;

        Object.keys(
          correctionMap
        ).forEach(wrong => {

          if (
            normalizedLine.includes(wrong)
          ) {

            matched = true;

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

        if (!matched) {
          foodKeywords.forEach(
            food => {

            if (
              normalizedLine.includes(food)
            ) {

              matched = true;

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
        }

        if (!matched) {

          const itemName =
            extractNameFromLine(rawLine)
              .replace(/[^가-힣0-9A-Za-z\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

          if (
            itemName.length >= 2 &&
            !stopLinePatterns.some(pattern =>
              itemName.toLowerCase().includes(pattern)
            ) &&
            /[가-힣]{2,}/.test(itemName)
          ) {

            possibleIngredients
              .push({

              id:
                crypto.randomUUID(),

              name: itemName,

              category:
                '냉장',

              expiryDate:
                '2026-12-31',

              quantity: 1,

              unit: '개'

            });

          }

        }

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

          success: true,

          message:
            '식재료 인식 실패',

          data: [],

          ingredients: [],

          ocrText: text

        });

      }

      res.json({

        success: true,

        data:
          uniqueIngredients,

        ingredients:
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