// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://refrigerator-app-jivi.onrender.com'
    : 'http://localhost:5000';

function App() {

  const [ingredients, setIngredients] = useState([]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('냉장');
  const [expiryDate, setExpiryDate] = useState('');

  const [recipe, setRecipe] = useState('');
  const [shoppingList, setShoppingList] = useState([]);

  // ======================
  // 재료 불러오기
  // ======================

  const fetchIngredients = async () => {

    try {

      const res = await axios.get(
        `${API_BASE_URL}/api/ingredients`
      );

      setIngredients(res.data);

    } catch (err) {

      console.error(err);

    }

  };

  useEffect(() => {

    fetchIngredients();

  }, []);

  // ======================
  // 재료 추가
  // ======================

  const handleSubmit = async (e) => {

    e.preventDefault();

    if (!name || !expiryDate) {

      alert('내용 입력');

      return;

    }

    await axios.post(
      `${API_BASE_URL}/api/ingredients`,
      {
        name,
        category,
        expiryDate
      }
    );

    setName('');
    setExpiryDate('');

    fetchIngredients();

  };

  // ======================
  // OCR
  // ======================

  const handleOcrUpload = async (e) => {

    const file = e.target.files[0];

    if (!file) return;

    const formData = new FormData();

    formData.append('receipt', file);

    alert('OCR 분석 시작');

    await axios.post(
      `${API_BASE_URL}/api/ocr`,
      formData
    );

    fetchIngredients();

  };

  // ======================
  // AI 레시피
  // ======================

  const getAiRecipe = async () => {

    setRecipe('AI 레시피 생성 중...');

    try {

      const res = await axios.get(
        `${API_BASE_URL}/api/ai-recipe`
      );

      setRecipe(res.data.recipe);

    } catch (err) {

      setRecipe('AI 오류');

    }

  };

  // ======================
  // 쇼핑리스트
  // ======================

  const getShoppingList = async () => {

    const res = await axios.get(
      `${API_BASE_URL}/api/shopping-list`
    );

    setShoppingList(res.data.shoppingList);

  };

  return (

    <div
      style={{
        padding: '20px',
        fontFamily: 'sans-serif',
        maxWidth: '700px',
        margin: '0 auto'
      }}
    >

      <h1
        style={{
          textAlign: 'center',
          marginBottom: '30px'
        }}
      >
        냉장고 관리 프로그램 🧊
      </h1>

      {/* OCR */}
      <section style={{ marginBottom: '25px' }}>

        <h3>🧾 영수증 OCR 등록</h3>

        <label
          style={{
            padding: '10px 15px',
            background: '#34495e',
            color: '#fff',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'inline-block'
          }}
        >

          카메라로 촬영하기

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleOcrUpload}
            style={{ display: 'none' }}
          />

        </label>

      </section>

      {/* 직접 입력 */}
      <section style={{ marginBottom: '25px' }}>

        <h3>✏️ 식재료 직접 입력</h3>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >

          <input
            type="text"
            placeholder="식재료 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: '10px'
            }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: '10px'
            }}
          >

            <option value="냉장">냉장</option>
            <option value="냉동">냉동</option>
            <option value="실온">실온</option>

          </select>

          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            style={{
              padding: '10px'
            }}
          />

          <button
            type="submit"
            style={{
              padding: '12px',
              background: '#2c3e50',
              color: '#fff',
              border: 'none',
              borderRadius: '5px'
            }}
          >
            등록
          </button>

        </form>

      </section>

      {/* 재고 현황 */}
      <section style={{ marginBottom: '25px' }}>

        <h3>🛒 냉장고 재고 현황</h3>

        {['냉장', '냉동', '실온'].map(cat => (

          <div
            key={cat}
            style={{
              marginBottom: '20px'
            }}
          >

            <h4
              style={{
                color: '#2980b9'
              }}
            >
              {cat}
            </h4>

            {ingredients
              .filter(item => item.category === cat)
              .map(item => (

                <div
                  key={item.id}
                  style={{
                    background: '#f8f9fa',
                    padding: '10px',
                    marginBottom: '10px',
                    borderRadius: '5px'
                  }}
                >

                  {/* 기본 정보 */}
                  <strong>{item.name}</strong>

                  <div
                    style={{
                      fontSize: '12px',
                      color: '#666',
                      marginTop: '3px',
                      marginBottom: '8px'
                    }}
                  >
                    유통기한: {item.expiryDate}
                  </div>

                  {/* 수정모드 */}
                  {item.editing && (

                    <div>

                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {

                          const updated = ingredients.map(ing =>

                            ing.id === item.id
                              ? {
                                  ...ing,
                                  name: e.target.value
                                }
                              : ing

                          );

                          setIngredients(updated);

                        }}
                        style={{
                          width: '100%',
                          marginBottom: '5px',
                          padding: '8px'
                        }}
                      />

                      <select
                        value={item.category}
                        onChange={(e) => {

                          const updated = ingredients.map(ing =>

                            ing.id === item.id
                              ? {
                                  ...ing,
                                  category: e.target.value
                                }
                              : ing

                          );

                          setIngredients(updated);

                        }}
                        style={{
                          width: '100%',
                          marginBottom: '5px',
                          padding: '8px'
                        }}
                      >

                        <option value="냉장">냉장</option>
                        <option value="냉동">냉동</option>
                        <option value="실온">실온</option>

                      </select>

                      <input
                        type="date"
                        value={item.expiryDate}
                        onChange={(e) => {

                          const updated = ingredients.map(ing =>

                            ing.id === item.id
                              ? {
                                  ...ing,
                                  expiryDate: e.target.value
                                }
                              : ing

                          );

                          setIngredients(updated);

                        }}
                        style={{
                          width: '100%',
                          marginBottom: '5px',
                          padding: '8px'
                        }}
                      />

                      <button
                        onClick={async () => {

                          await axios.put(
                            `${API_BASE_URL}/api/ingredients/${item.id}`,
                            item
                          );

                          const updated = ingredients.map(ing =>

                            ing.id === item.id
                              ? {
                                  ...ing,
                                  editing: false
                                }
                              : ing

                          );

                          setIngredients(updated);

                          alert('수정 완료');

                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          background: '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          marginBottom: '5px'
                        }}
                      >
                        저장
                      </button>

                    </div>

                  )}

                  {/* 버튼 */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '5px'
                    }}
                  >

                    <button
                      onClick={() => {

                        const updated = ingredients.map(ing =>

                          ing.id === item.id
                            ? {
                                ...ing,
                                editing: !ing.editing
                              }
                            : ing

                        );

                        setIngredients(updated);

                      }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: '#2980b9',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px'
                      }}
                    >
                      수정
                    </button>

                    <button
                      onClick={async () => {

                        if (!window.confirm('삭제하시겠습니까?')) {
                          return;
                        }

                        await axios.delete(
                          `${API_BASE_URL}/api/ingredients/${item.id}`
                        );

                        fetchIngredients();

                      }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px'
                      }}
                    >
                      삭제
                    </button>

                  </div>

                </div>

              ))}

          </div>

        ))}

      </section>

      {/* AI */}
      <section style={{ marginBottom: '25px' }}>

        <h3>🤖 AI 레시피 추천</h3>

        <button
          onClick={getAiRecipe}
          style={{
            width: '100%',
            padding: '12px',
            background: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '5px'
          }}
        >
          레시피 추천 받기
        </button>

        {recipe && (

          <div
            style={{
              marginTop: '10px',
              padding: '15px',
              background: '#f1f9f5',
              borderRadius: '5px',
              whiteSpace: 'pre-wrap'
            }}
          >
            {recipe}
          </div>

        )}

      </section>

      {/* 쇼핑리스트 */}
      <section>

        <h3>📝 쇼핑리스트</h3>

        <button
          onClick={getShoppingList}
          style={{
            width: '100%',
            padding: '12px',
            background: '#2980b9',
            color: 'white',
            border: 'none',
            borderRadius: '5px'
          }}
        >
          쇼핑리스트 생성
        </button>

        {shoppingList.length > 0 && (

          <ul
            style={{
              marginTop: '10px'
            }}
          >

            {shoppingList.map((item, idx) => (

              <li key={idx}>
                {item}
              </li>

            ))}

          </ul>

        )}

      </section>

    </div>

  );

}

export default App;